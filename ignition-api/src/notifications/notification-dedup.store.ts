import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

/** Default deduplication window: one hour. */
export const DEFAULT_DEDUP_WINDOW_MS = 60 * 60 * 1000;

/** Value written while the claiming caller has not yet persisted a row. */
export const PENDING_MARKER = 'pending';

export interface DedupClaim {
  /** True when this caller now owns the window and should create the notification. */
  claimed: boolean;
  /**
   * Value already stored against the key when `claimed` is false — the existing
   * notification's id once the owner has recorded it, or {@link PENDING_MARKER}
   * while the owner is still mid-write.
   */
  existing?: string;
}

export interface DedupEntry {
  /** Full Redis key, including the environment prefix. */
  key: string;
  /** Notification id, or {@link PENDING_MARKER}. */
  value: string;
  /** Milliseconds left before the key expires; -1 when it has no TTL. */
  ttlMs: number;
}

/**
 * Issue #623 — Redis-backed notification deduplication.
 *
 * ## Why a dedicated ioredis client
 *
 * The rest of the app reaches Redis through `CACHE_MANAGER` / Keyv, which has no
 * way to express `SET … NX`. Without NX there is no atomic claim: two callers
 * both read "absent", both write, and both send a notification. The existing SSE
 * consumer relies on `cache.set()` returning falsy when a key already exists
 * (`stellar-sse-consumer.service.ts`, the "Atomic SET NX de-duplication"
 * comment), but Keyv's `set` overwrites and resolves `true` either way, so that
 * guard never actually fires. This store therefore takes its own `ioredis`
 * connection, following `ThrottlerRedisStorage`, and issues a real
 * `SET key value PX <window> NX`.
 *
 * ## Key shape
 *
 * `sha256(userId:eventType:resourceId)`, namespaced per environment. Hashing
 * keeps user ids and resource ids out of Redis keys — which surface in `SCAN`
 * output, slow logs and metrics — and gives every key the same length regardless
 * of how long the inputs were.
 */
@Injectable()
export class NotificationDedupStore implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationDedupStore.name);
  private readonly redis: Redis;
  private readonly keyPrefix: string;

  /** Deduplication window in milliseconds. Configurable, one hour by default. */
  readonly windowMs: number;

  constructor(private readonly config: ConfigService) {
    const environment = this.config.get<string>('NODE_ENV', 'development');
    this.keyPrefix = `notif-dedup:${environment}`;
    this.windowMs = Number(
      this.config.get<number>(
        'NOTIFICATION_DEDUP_WINDOW_MS',
        DEFAULT_DEDUP_WINDOW_MS,
      ),
    );
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Builds the deduplication key for one user/event/resource triple.
   *
   * @param userId - Recipient.
   * @param eventType - Notification type.
   * @param resourceId - Related resource; the empty string when the event has none.
   * @returns The prefixed, hashed Redis key.
   */
  key(userId: string, eventType: string, resourceId: string): string {
    const digest = createHash('sha256')
      .update(`${userId}:${eventType}:${resourceId}`)
      .digest('hex');

    return `${this.keyPrefix}:${digest}`;
  }

  /**
   * Attempts to claim the window for a key.
   *
   * @param key - A key from {@link key}.
   * @returns `claimed: true` for the first caller inside the window; otherwise
   *          `claimed: false` with whatever the owner stored.
   */
  async claim(key: string): Promise<DedupClaim> {
    try {
      const result = await this.redis.set(
        key,
        PENDING_MARKER,
        'PX',
        this.windowMs,
        'NX',
      );

      if (result === 'OK') {
        return { claimed: true };
      }

      const existing = await this.redis.get(key);
      return { claimed: false, existing: existing ?? undefined };
    } catch (error) {
      // Fail open. A Redis outage must not stop notifications being delivered;
      // the caller's database guard still prevents duplicate rows.
      this.logger.warn(
        `Dedup claim failed, allowing notification through: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { claimed: true };
    }
  }

  /**
   * Records the created notification's id against an already-claimed key,
   * without extending the window.
   *
   * `KEEPTTL` matters: refreshing the expiry here would let a steady trickle of
   * duplicate events hold the key open indefinitely, so the window would never
   * close and later legitimate notifications would be suppressed.
   *
   * @param key - The claimed key.
   * @param notificationId - Id of the row that was created.
   */
  async recordNotificationId(key: string, notificationId: string): Promise<void> {
    try {
      await this.redis.set(key, notificationId, 'KEEPTTL', 'XX');
    } catch (error) {
      this.logger.warn(
        `Could not record notification id on dedup key: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Releases a key so a retry is not suppressed after a failed write. */
  async release(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(
        `Could not release dedup key: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Lists the live deduplication keys, for the admin view.
   *
   * Uses `SCAN` rather than `KEYS` so a large cache cannot block Redis.
   *
   * @param limit - Maximum entries to return.
   * @returns Entries with their stored value and remaining TTL.
   */
  async entries(limit = 100): Promise<DedupEntry[]> {
    const found: DedupEntry[] = [];
    let cursor = '0';

    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.keyPrefix}:*`,
        'COUNT',
        100,
      );
      cursor = next;

      for (const key of keys) {
        if (found.length >= limit) break;

        const [value, ttlMs] = await Promise.all([
          this.redis.get(key),
          this.redis.pttl(key),
        ]);

        found.push({ key, value: value ?? PENDING_MARKER, ttlMs });
      }
    } while (cursor !== '0' && found.length < limit);

    return found;
  }

  /**
   * Clears the deduplication cache.
   *
   * Only keys under this environment's prefix are removed, so clearing in one
   * environment cannot disturb another sharing the Redis instance.
   *
   * @returns How many keys were deleted.
   */
  async clear(): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.keyPrefix}:*`,
        'COUNT',
        100,
      );
      cursor = next;

      if (keys.length > 0) {
        deleted += await this.redis.del(...keys);
      }
    } while (cursor !== '0');

    this.logger.log(`Dedup cache cleared: ${deleted} key(s)`);
    return deleted;
  }
}
