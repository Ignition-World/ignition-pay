import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import { randomBytes } from 'crypto';
import { SettingsService } from '../settings/settings.service';

export interface SessionMetadata {
  sessionId: string;
  userId: string;
  walletAddress: string;
  role: string;
  createdAt: number; // Unix timestamp (ms)
  expiresAt: number; // Unix timestamp (ms)
  lastSeenAt: number;
  ipAddress?: string;
  userAgent?: string;
  /** Issue #405 — Device fingerprint for session binding. */
  deviceFingerprint?: string;
}

/** Prefix for individual session hash keys: session:{sessionId} */
const SESSION_KEY = (sessionId: string) => `session:${sessionId}`;

/** Prefix for the per-user session index (a JSON array of session IDs) */
const USER_SESSIONS_KEY = (userId: string) => `user_sessions:${userId}`;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  /** Default values as fallback if database settings are unavailable */
  private readonly defaultAccessTtlSeconds: number;
  private readonly defaultSessionTtlSeconds: number;
  private readonly defaultIdleTimeoutSeconds: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    // Initialize defaults from environment variables
    this.defaultAccessTtlSeconds = this.config.get<number>(
      'SESSION_ACCESS_TTL_SECONDS',
      900,
    );
    this.defaultSessionTtlSeconds = this.config.get<number>(
      'SESSION_TTL_SECONDS',
      604800,
    ); // 7d
    this.defaultIdleTimeoutSeconds = this.config.get<number>(
      'SESSION_IDLE_TIMEOUT_SECONDS',
      1800,
    ); // 30 min

    // Issue #402 — Validate that the session store is backed by Redis.
    // In-memory stores cause session fragmentation behind load balancers,
    // leading to random auth failures when requests land on different instances.
    this.validateSessionStore().catch((err) => {
      this.logger.error(
        `Session store validation failed: ${err.message}. ` +
          'Sessions may not persist across restarts or scale horizontally.',
      );
    });
  }

  /**
   * Issue #402 — On startup, verify that the CACHE_MANAGER is connected to
   * an external store (Redis) rather than the default in-memory Map.  When
   * the store is in-memory, multi-instance deployments behind a load balancer
   * will randomly fail auth because sessions created on one instance are
   * invisible to the others.
   */
  private async validateSessionStore(): Promise<void> {
    const testKey = '__session_store_health_check__';
    const testValue = 'ok';
    try {
      await this.cache.set(testKey, testValue, 5000);
      const retrieved = await this.cache.get<string>(testKey);
      await this.cache.delete(testKey);

      if (retrieved !== testValue) {
        this.logger.warn(
          'Session store returned unexpected value — ' +
            'session persistence may be unreliable.',
        );
      } else {
        this.logger.log('Session store connectivity verified.');
      }
    } catch (err) {
      // Re-throw so the .catch() in the constructor logs it
      throw err;
    }
  }

  /**
   * Get current access TTL from settings (with fallback to defaults)
   */
  private async getAccessTtlSeconds(): Promise<number> {
    try {
      const settings = await this.settingsService.getSettings();
      return settings.sessionAccessTtlSeconds;
    } catch {
      return this.defaultAccessTtlSeconds;
    }
  }

  /**
   * Get current session TTL from settings (with fallback to defaults)
   */
  private async getSessionTtlSeconds(): Promise<number> {
    try {
      const settings = await this.settingsService.getSettings();
      return settings.sessionTtlSeconds;
    } catch {
      return this.defaultSessionTtlSeconds;
    }
  }

  /**
   * Get current idle timeout from settings (with fallback to defaults)
   */
  private async getIdleTimeoutSeconds(): Promise<number> {
    try {
      const settings = await this.settingsService.getSettings();
      return settings.sessionIdleTimeoutSeconds;
    } catch {
      return this.defaultIdleTimeoutSeconds;
    }
  }

  /**
   * Get session persistence setting from database
   */
  private async isSessionPersistenceEnabled(): Promise<boolean> {
    try {
      const settings = await this.settingsService.getSettings();
      return settings.sessionPersistenceEnabled;
    } catch {
      return true; // Default to enabled
    }
  }

  /** Returns true when the session has exceeded the idle timeout window. */
  async isIdleExpired(session: SessionMetadata): Promise<boolean> {
    const idleTimeoutSeconds = await this.getIdleTimeoutSeconds();
    if (idleTimeoutSeconds <= 0) return false;
    const idleMs = idleTimeoutSeconds * 1000;
    return Date.now() - session.lastSeenAt > idleMs;
  }

  /** Generate a cryptographically random session ID */
  generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create and persist a new session.
   * Returns the session metadata (including the new sessionId).
   */
  async createSession(params: {
    userId: string;
    walletAddress: string;
    role: string;
    ipAddress?: string;
    userAgent?: string;
    /** Issue #405 — Device fingerprint for session binding. */
    deviceFingerprint?: string;
  }): Promise<SessionMetadata> {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const sessionTtlSeconds = await this.getSessionTtlSeconds();
    const sessionTtlMs = sessionTtlSeconds * 1000;
    const expiresAt = now + sessionTtlMs;

    const session: SessionMetadata = {
      sessionId,
      userId: params.userId,
      walletAddress: params.walletAddress,
      role: params.role,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceFingerprint: params.deviceFingerprint,
    };

    // Persist session data
    await this.cache.set(
      SESSION_KEY(sessionId),
      JSON.stringify(session),
      sessionTtlMs,
    );

    // Add to user's session index
    await this.addToUserIndex(params.userId, sessionId);

    this.logger.log(`Session created: ${sessionId} for user ${params.userId}`);
    return session;
  }

  /**
   * Look up a session by ID.
   * Returns null if not found, absolutely expired, or idle-timed-out.
   *
   * Issue #264 — Idle timeout:
   *   A session is invalidated and freed from Redis when the time since
   *   `lastSeenAt` exceeds `SESSION_IDLE_TIMEOUT_SECONDS`, even if the
   *   absolute `expiresAt` horizon has not yet been reached.  The Redis
   *   key is deleted immediately so the slot is freed without waiting for
   *   the TTL to drain naturally.
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    const raw = await this.cache.get<string>(SESSION_KEY(sessionId));
    if (!raw) return null;

    try {
      const session: SessionMetadata = JSON.parse(raw);

      // Absolute expiry check
      if (Date.now() > session.expiresAt) {
        await this.revokeSession(session.userId, sessionId);
        return null;
      }

      // Issue #264 — Idle timeout check
      if (await this.isIdleExpired(session)) {
        const idleTimeoutSeconds = await this.getIdleTimeoutSeconds();
        this.logger.log(
          `Session ${sessionId} idle-expired for user ${session.userId} ` +
            `(idle ${Math.round((Date.now() - session.lastSeenAt) / 1000)}s > ` +
            `limit ${idleTimeoutSeconds}s)`,
        );
        await this.revokeSession(session.userId, sessionId);
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Slide the session TTL and update lastSeenAt (called on each authenticated request).
   * Only extends session if session persistence is enabled.
   */
  async touchSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const persistenceEnabled = await this.isSessionPersistenceEnabled();
    const sessionTtlSeconds = await this.getSessionTtlSeconds();
    const sessionTtlMs = sessionTtlSeconds * 1000;

    session.lastSeenAt = Date.now();
    
    // Only extend session expiration if persistence is enabled
    if (persistenceEnabled) {
      session.expiresAt = Date.now() + sessionTtlMs;
    }

    await this.cache.set(
      SESSION_KEY(sessionId),
      JSON.stringify(session),
      sessionTtlMs,
    );
  }

  /**
   * Revoke (delete) a single session.
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.cache.delete(SESSION_KEY(sessionId));
    await this.removeFromUserIndex(userId, sessionId);
    this.logger.log(`Session revoked: ${sessionId} for user ${userId}`);
  }

  /**
   * Revoke all sessions for a user (e.g., on password reset).
   */
  async revokeAllSessions(userId: string): Promise<void> {
    const sessionIds = await this.getUserSessionIds(userId);
    await Promise.all(
      sessionIds.map((id) => this.cache.delete(SESSION_KEY(id))),
    );
    await this.cache.delete(USER_SESSIONS_KEY(userId));
    this.logger.log(`All sessions revoked for user ${userId}`);
  }

  /**
   * Return all active session metadata objects for a user.
   * Stale (expired or missing) entries are pruned automatically.
   */
  async getActiveSessions(userId: string): Promise<SessionMetadata[]> {
    const sessionIds = await this.getUserSessionIds(userId);
    const sessions: SessionMetadata[] = [];
    const stale: string[] = [];

    for (const id of sessionIds) {
      const session = await this.getSession(id);
      if (session) {
        sessions.push(session);
      } else {
        stale.push(id);
      }
    }

    // Prune stale IDs from the index without awaiting
    if (stale.length > 0) {
      void this.pruneUserIndex(userId, stale);
    }

    return sessions;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getUserSessionIds(userId: string): Promise<string[]> {
    const raw = await this.cache.get<string>(USER_SESSIONS_KEY(userId));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  private async addToUserIndex(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const existing = await this.getUserSessionIds(userId);
    const updated = [...new Set([...existing, sessionId])];
    // Keep the index alive as long as the longest possible session
    await this.cache.set(
      USER_SESSIONS_KEY(userId),
      JSON.stringify(updated),
      this.sessionTtlMs,
    );
  }

  private async removeFromUserIndex(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const existing = await this.getUserSessionIds(userId);
    const updated = existing.filter((id) => id !== sessionId);
    if (updated.length === 0) {
      await this.cache.delete(USER_SESSIONS_KEY(userId));
    } else {
      await this.cache.set(
        USER_SESSIONS_KEY(userId),
        JSON.stringify(updated),
        this.sessionTtlMs,
      );
    }
  }

  private async pruneUserIndex(
    userId: string,
    staleIds: string[],
  ): Promise<void> {
    const existing = await this.getUserSessionIds(userId);
    const updated = existing.filter((id) => !staleIds.includes(id));
    if (updated.length === 0) {
      await this.cache.delete(USER_SESSIONS_KEY(userId));
    } else {
      await this.cache.set(
        USER_SESSIONS_KEY(userId),
        JSON.stringify(updated),
        this.sessionTtlMs,
      );
    }
  }
}