import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { randomUUID } from 'crypto';
import Keyv from 'keyv';
import { UserRole } from '@prisma/client';

import { LoginResponseDto } from '../users/dto/login.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions/permissions.service';
import { SettingsService } from '../settings/settings.service';

// Minimal user shape that AuthTokenService needs to mint/revoke tokens.
// Allows callers (auth-verify.controller, users.service.login) to pass
// in the persisted user without coupling to the full Prisma type.
export interface AuthenticatedUser {
  id: string;
  walletAddress: string | null;
  role: UserRole | string;
}

interface RefreshTokenPayload {
  sub: string;
  fid?: string; // Issue #226: token-family ID for reuse detection
  sid?: string;
  iat?: number;
  exp?: number;
}

// Issue #226: The value stored in Redis under `refresh:{walletAddress}`.
// Storing both the token and its familyId allows reuse detection without
// an extra Redis round-trip: when a mismatch occurs we can compare the
// presented token's family against the stored family to decide whether
// this is a rotated-out token being replayed (theft signal) or just a
// completely unrelated invalid token.
interface StoredRefreshRecord {
  token: string;
  familyId: string;
}

// Issue #230: Access tokens carry the OAuth2 `scope` claim so route guards
// can enforce least privilege without re-reading the role→permission map
// on every request. The value is a space-delimited string per RFC 6749 §3.3.
interface AccessTokenPayload {
  sub: string;
  walletAddress: string;
  role: UserRole | string;
  sid?: string;
  scope?: string;
}

@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  /** Default values as fallback */
  private readonly DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  private readonly DEFAULT_ACCESS_TTL = '15m';

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly settingsService: SettingsService,
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
  ) {}

  /**
   * Cache key used to store the *current* refresh token record for a wallet
   * user. The record is rotated on every successful /auth/refresh.
   */
  refreshCacheKey(walletAddress: string): string {
    return `refresh:${walletAddress}`;
  }

  /**
   * Build the OAuth2 `scope` claim value (RFC 6749 §3.3) for the given
   * role. Kept private so callers don't accidentally mint tokens with a
   * hand-built scope that drifts from the role→permission map.
   */
  private buildScopeClaim(role: UserRole | string): string {
    const roleKey = String(role ?? '');
    return this.permissionsService.getScopeStringForRole(roleKey);
  }

  /**
   * Mint a fresh (access, refresh) token pair for a user, write the
   * refresh token into the cache so subsequent /auth/refresh calls can
   * validate + rotate it, and return both tokens.
   *
   * Issue #226: every issued refresh token now carries a `fid` (family ID)
   * claim and the stored Redis record captures both the token string and
   * the family ID. This enables reuse detection in validateAndRotate: a
   * mismatch where the family IDs match means an old rotated-out token is
   * being replayed — a strong signal of token theft.
   *
   * Issue #230: the access token now carries a `scope` claim derived from
   * the user's role so downstream guards can enforce least privilege.
   * The refresh token stays minimal (sub + fid + optional sid) and is
   * resolved server-side on rotation so role changes propagate transparently.
   */
  async issueTokenPair(
    user: AuthenticatedUser,
    sessionId?: string,
    /**
     * Issue #226: callers may pass an existing familyId to continue a token
     * family across a rotation. If omitted a fresh family is started.
     */
    familyId?: string,
  ): Promise<LoginResponseDto> {
    // Security: revoke any existing refresh tokens for this user before issuing
    // a new pair. Prevents multiple valid token chains and replay attacks.
    const walletAddress = user.walletAddress ?? '';
    if (walletAddress) {
      await this.revokeAllTokensForUser(walletAddress);
    }
    const fid = familyId ?? randomUUID();
    
    // Get current session settings from database
    const settings = await this.settingsService.getSettings();
    const accessTtlSeconds = settings.sessionAccessTtlSeconds;
    const refreshTtlSeconds = settings.sessionTtlSeconds;

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      walletAddress,
      role: user.role,
      scope: this.buildScopeClaim(user.role),
      ...(sessionId ? { sid: sessionId } : {}),
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: `${accessTtlSeconds}s`,
    });

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      fid,
      ...(sessionId ? { sid: sessionId } : {}),
    };

    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.get<string>(
        'REFRESH_TOKEN_SECRET',
        'default-refresh-secret',
      ),
      expiresIn: `${refreshTtlSeconds}s`,
    });

    const record: StoredRefreshRecord = { token: refreshToken, familyId: fid };

    try {
      // Overwrite any prior refresh token record — only the latest one is valid.
      await this.cache.set(
        this.refreshCacheKey(walletAddress),
        JSON.stringify(record),
        refreshTtlSeconds * 1000,
      );
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  /**
   * Validate a refresh token, rotate it in the cache, and return a brand
   * new (access, refresh) pair. Rejects expired/revoked/mismatched
   * tokens with 401; surfaces Redis / Prisma failures as 503.
   *
   * Issue #226: Reuse detection — if the presented token does not match the
   * stored token but carries the *same* family ID as the stored record, this
   * indicates a previously-issued (rotated-out) token is being replayed.
   * This is a strong signal of refresh-token theft. The entire token family
   * is immediately invalidated (stored record deleted) and a security event
   * is logged. A plain "Refresh token has been revoked" 401 is returned so
   * that the error response does not reveal the reuse-detection mechanism to
   * an attacker.
   *
   * Issue #230: re-derives the `scope` claim from the freshly-read user's
   * role so role changes (e.g. admin demotion) take effect on the very
   * next token rotation without forcing the user to log out.
   */
  async validateAndRotate(refreshToken: string): Promise<LoginResponseDto> {
    if (!refreshToken || refreshToken.trim() === '') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: RefreshTokenPayload;

    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>(
          'REFRESH_TOKEN_SECRET',
          'default-refresh-secret',
        ),
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException('Refresh token expired');
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.sub || payload.sub.trim() === '') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: payload.sub, isActive: true, deletedAt: null },
      });
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const cacheKey = this.refreshCacheKey(user.walletAddress ?? '');
    let rawStored: string | undefined;

    try {
      rawStored = await this.cache.get(cacheKey);
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    // ── No stored record ────────────────────────────────────────────────
    if (!rawStored) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // ── Parse the stored record ──────────────────────────────────────────
    let storedRecord: StoredRefreshRecord;
    try {
      storedRecord = JSON.parse(rawStored) as StoredRefreshRecord;
    } catch {
      // Stored value is a legacy plain-string token (no family ID).
      // Fall back to direct comparison; reuse detection is not available
      // for this token generation.
      storedRecord = { token: rawStored, familyId: '' };
    }

    // ── Token mismatch ───────────────────────────────────────────────────
    if (storedRecord.token !== refreshToken) {
      // Issue #226: Reuse detection.
      // If the presented token carries a family ID that matches the one
      // currently on record, the client is replaying a rotated-out token.
      // This is a theft signal — nuke the entire token family.
      const presentedFamilyId = payload.fid ?? '';
      const storedFamilyId = storedRecord.familyId ?? '';

      if (
        presentedFamilyId &&
        storedFamilyId &&
        presentedFamilyId === storedFamilyId
      ) {
        // Security event: potential refresh-token theft detected.
        // Revoke all tokens for this user immediately.
        this.logger.warn(
          `Refresh token reuse detected for user ${user.id} (family: ${presentedFamilyId}). ` +
            `Revoking entire token family.`,
        );
        try {
          await this.revokeAllTokensForUser(user.walletAddress ?? '');
        } catch {
          // Best-effort: even if revocation fails, do not issue new tokens.
        }
      }

      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // ── Token matches — rotate ───────────────────────────────────────────
    // Issue #230: derive scopes from the current role so demotions/promotions
    // take effect on the next refresh, without invalidating active sessions.
    // Get current session settings from database
    const settings = await this.settingsService.getSettings();
    const accessTtlSeconds = settings.sessionAccessTtlSeconds;
    const refreshTtlSeconds = settings.sessionTtlSeconds;

    const rotationPayload: AccessTokenPayload = {
      sub: user.id,
      walletAddress: user.walletAddress ?? '',
      role: user.role,
      scope: this.buildScopeClaim(user.role),
    };

    const accessToken = this.jwt.sign(rotationPayload, {
      secret: this.config.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: `${accessTtlSeconds}s`,
    });

    // Issue #226: preserve the same family ID across the rotation chain so
    // future reuse of this now-rotated-out token can be detected.
    const currentFamilyId = storedRecord.familyId || randomUUID();
    const newRefreshPayload: RefreshTokenPayload = {
      sub: user.id,
      fid: currentFamilyId,
    };

    const newRefreshToken = this.jwt.sign(newRefreshPayload, {
      secret: this.config.get<string>(
        'REFRESH_TOKEN_SECRET',
        'default-refresh-secret',
      ),
      expiresIn: `${refreshTtlSeconds}s`,
    });

    const newRecord: StoredRefreshRecord = {
      token: newRefreshToken,
      familyId: currentFamilyId,
    };

    try {
      await this.cache.delete(cacheKey);
      await this.cache.set(
        cacheKey,
        JSON.stringify(newRecord),
        refreshTtlSeconds * 1000,
      );
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    return { accessToken, refreshToken: newRefreshToken, tokenType: 'Bearer' };
  }

  /**
   * Securely revoke the refresh token for a user. Called by /auth/logout
   * (and any other revoking flow) so that even if the refresh token was
   * stolen, it can never be used again after this call returns.
   */
  async revokeRefreshToken(
    walletAddress: string | null | undefined,
  ): Promise<void> {
    if (!walletAddress) {
      return;
    }
    try {
      await this.cache.delete(this.refreshCacheKey(walletAddress));
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }

  /**
   * Issue #226: Revoke all tokens for a user by deleting the stored refresh
   * record. This is the nuclear option for reuse-detection scenarios where
   * a rotated-out refresh token is presented — indicating the token may have
   * been stolen. After this call:
   *   - Any outstanding refresh token for this user is rejected with 401.
   *   - The user must re-authenticate to obtain a new token pair.
   */
  async revokeAllTokensForUser(walletAddress: string): Promise<void> {
    if (!walletAddress) {
      return;
    }
    try {
      await this.cache.delete(this.refreshCacheKey(walletAddress));
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }

  // ── Access-token blacklist ──────────────────────────────────────────────

  /**
   * Redis key used to flag a session ID as revoked.
   * Checked by JwtStrategy.validate() so that even standard
   * JwtAuthGuard-protected endpoints reject tokens whose session
   * was destroyed (e.g. on logout).
   */
  blacklistKey(sessionId: string): string {
    return `revoked:${sessionId}`;
  }

  /**
   * Blacklist the current access token by its session ID.
   * The entry expires after 15 minutes — the same TTL as the
   * access token itself — so no manual cleanup is needed.
   */
  async blacklistAccessToken(sessionId: string): Promise<void> {
    try {
      await this.cache.set(
        this.blacklistKey(sessionId),
        '1',
        15 * 60 * 1000, // 15 minutes in ms
      );
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }

  /**
   * Returns true when the given session ID has been explicitly
   * blacklisted (i.e. the session was revoked / user logged out).
   */
  async isAccessTokenBlacklisted(sessionId: string): Promise<boolean> {
    try {
      const val = await this.cache.get<string>(this.blacklistKey(sessionId));
      return val === '1';
    } catch {
      // If Redis is down, fail open — the session guard / JWT
      // expiry will still protect the endpoint.
      return false;
    }
  }
}