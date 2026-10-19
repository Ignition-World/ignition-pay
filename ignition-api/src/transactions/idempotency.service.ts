import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';

/**
 * Issue #615 — how long the result of a request is replayable for a given
 * `Idempotency-Key`. 24 hours, as specified by the issue.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The issue specifies UUID keys. We accept only RFC 4122 v4 UUIDs so that a
 * client sending an arbitrary string gets a 400 instead of silently getting a
 * second, independent idempotency slot for what it believes is a retry.
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(key: string): boolean {
  return UUID_V4_PATTERN.test(key);
}

/**
 * Only the SHA-256 digest of the key is ever persisted — never the raw key.
 * An `Idempotency-Key` is replayable credential-shaped data: anyone holding it
 * can retrieve the original response. Mirrors `UsersService.hashToken` (email
 * verification tokens) and `ApiKeysController.create`, which also store only
 * digests. A plain SHA-256 is sufficient here because the input is a 122-bit
 * random UUID, so there is no dictionary to attack.
 */
export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Marker written when a key is claimed but the request has not finished yet. */
const IN_FLIGHT = 'in_flight';

interface StoredIdempotencyRecord {
  state: typeof IN_FLIGHT | 'complete';
  response?: unknown;
}

export type IdempotencyClaim =
  /** This request owns the key and must do the work, then call `complete`. */
  | { status: 'claimed' }
  /** A previous request already finished; replay its stored response verbatim. */
  | { status: 'replayed'; response: unknown };

/**
 * Tag used to round-trip `Date` values through JSON so a replayed response is
 * shaped exactly like the original the caller received (the transaction DTO
 * exposes `createdAt` / `updatedAt` as `Date`, not `string`).
 */
const DATE_TAG = '__isoDate';

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val instanceof Date ? { [DATE_TAG]: val.toISOString() } : val,
  );
}

function decode(raw: string): unknown {
  return JSON.parse(raw, (_key, val) =>
    val && typeof val === 'object' && typeof val[DATE_TAG] === 'string'
      ? new Date(val[DATE_TAG])
      : val,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Issue #615 — `Idempotency-Key` support for `POST /transactions`.
 *
 * Backed directly by Redis (an existing dependency already used by
 * `ThrottlerRedisStorage`, `ContractEventsProcessor` and `RedisModule`) rather
 * than by `CACHE_MANAGER`/Keyv, because Keyv exposes no compare-and-set
 * primitive. The atomicity guarantee comes from a single `SET key value
 * NX PX ttl` round trip: Redis executes it as one command, so of two
 * concurrent requests carrying the same key exactly one sees `OK`. A
 * read-then-write (`GET` then `SET`) would let both pass the check and both
 * insert a row, which is the bug this replaces.
 *
 * The alternative — a `UNIQUE` index on a new `idempotencyKeyHash` column —
 * would also be atomic, but it needs a Prisma migration against a live
 * database and provides no TTL, so a key could never be forgotten.
 *
 * A caller that loses the race does not get an error: it polls briefly for the
 * winner to publish its response and then replays it, which is what a client
 * retrying after a network blip actually wants. Only if the winner is still
 * running after the wait budget does the caller receive a 409.
 */
@Injectable()
export class IdempotencyService implements OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyService.name);

  /**
   * Bounded retry for the narrow race where the record expires (or is released
   * by a failed request) between our failed `SET ... NX` and the follow-up read.
   */
  private static readonly MAX_CLAIM_ATTEMPTS = 2;

  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly waitTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    this.keyPrefix = this.config.get<string>(
      'IDEMPOTENCY_KEY_PREFIX',
      'idempotency:transaction',
    );
    this.waitTimeoutMs = this.config.get<number>(
      'IDEMPOTENCY_WAIT_TIMEOUT_MS',
      2_000,
    );
    this.pollIntervalMs = this.config.get<number>(
      'IDEMPOTENCY_POLL_INTERVAL_MS',
      50,
    );
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  /** Redis key for a client-supplied `Idempotency-Key` (digest, never raw). */
  storageKey(key: string): string {
    return `${this.keyPrefix}:${hashIdempotencyKey(key)}`;
  }

  /**
   * Atomically claim `key` for the current request.
   *
   * Exactly one concurrent caller receives `{ status: 'claimed' }`; every other
   * caller either replays the stored response or throws `ConflictException`
   * once the wait budget is exhausted.
   *
   * @throws ConflictException when the original request is still running.
   * @throws ServiceUnavailableException when the record cannot be settled.
   */
  async claim(key: string): Promise<IdempotencyClaim> {
    const storageKey = this.storageKey(key);
    const deadline = Date.now() + this.waitTimeoutMs;
    let sawInFlight = false;

    for (let attempt = 0; attempt < IdempotencyService.MAX_CLAIM_ATTEMPTS; attempt++) {
      const claimed = await this.redis.set(
        storageKey,
        encode({ state: IN_FLIGHT }),
        'PX',
        IDEMPOTENCY_TTL_MS,
        'NX',
      );

      if (claimed === 'OK') {
        return { status: 'claimed' };
      }

      const existing = await this.read(storageKey);
      if (existing === null) {
        // The record vanished between the failed SET and the read (TTL expiry
        // or a `release` from a failed request). Try to claim it again.
        continue;
      }

      if (existing.state === 'complete') {
        return { status: 'replayed', response: existing.response };
      }

      // Another request holds the claim. Wait for it to publish its result so
      // a duplicate delivered mid-flight still gets the original response.
      sawInFlight = true;
      let released = false;
      while (Date.now() < deadline) {
        await sleep(this.pollIntervalMs);
        const settled = await this.read(storageKey);
        if (settled === null) {
          // The holder failed and released; fall through to re-claim.
          released = true;
          break;
        }
        if (settled.state === 'complete') {
          return { status: 'replayed', response: settled.response };
        }
      }

      if (!released) {
        break;
      }
    }

    if (!sawInFlight) {
      this.logger.error(
        `Unable to settle Idempotency-Key record ${storageKey} after ` +
          `${IdempotencyService.MAX_CLAIM_ATTEMPTS} attempts`,
      );
      throw new ServiceUnavailableException(
        'Idempotency store is unavailable, please retry',
      );
    }

    throw new ConflictException(
      'A request with this Idempotency-Key is still in progress',
    );
  }

  /**
   * Replace the in-flight claim with the finished response and restart the
   * 24-hour TTL, so replays keep working for the full window measured from
   * completion rather than from the start of the original request.
   */
  async complete(key: string, response: unknown): Promise<void> {
    const record: StoredIdempotencyRecord = { state: 'complete', response };
    await this.redis.set(
      this.storageKey(key),
      encode(record),
      'PX',
      IDEMPOTENCY_TTL_MS,
    );
  }

  /**
   * Drop the claim after a failed attempt so the client may retry with the same
   * key. Without this a single validation error would poison the key for 24h.
   */
  async release(key: string): Promise<void> {
    await this.redis.del(this.storageKey(key));
  }

  private async read(
    storageKey: string,
  ): Promise<StoredIdempotencyRecord | null> {
    const raw = await this.redis.get(storageKey);
    if (raw === null) {
      return null;
    }
    try {
      return decode(raw) as StoredIdempotencyRecord;
    } catch (err) {
      this.logger.warn(
        `Discarding unreadable Idempotency-Key record: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
