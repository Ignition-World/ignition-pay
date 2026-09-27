import { Logger } from '@nestjs/common';

/** How long a failed replica stays out of rotation before reads try it again. */
export const DEFAULT_REPLICA_COOLDOWN_MS = 30_000;

/** Minimum gap between two replica liveness probes, so a health poll storm
 *  cannot turn into a connection storm against the replica. */
export const DEFAULT_REPLICA_PROBE_INTERVAL_MS = 5_000;

/**
 * The only client surface the router needs. `PrismaClient` satisfies it with
 * the `$connect()` it already exposes; keeping the constraint this narrow is
 * what lets the failover logic be unit-tested without a database.
 */
export interface ReplicaClientLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}

export interface ReplicaStatus {
  /** A replica URL was configured and a replica client exists. */
  enabled: boolean;
  /** Reads are currently being served by the replica. */
  inUse: boolean;
  /** The replica answered its last liveness probe successfully. */
  healthy: boolean;
  consecutiveFailures: number;
  /** ISO timestamp of the last probe, or null before the first one. */
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Milliseconds until the replica is eligible for reads again. */
  cooldownRemainingMs: number;
}

export interface ReadReplicaRouterOptions {
  cooldownMs?: number;
  probeIntervalMs?: number;
  now?: () => number;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Routes reads to a read replica and fails **open to the primary** when the
 * replica is unavailable (issue #599).
 *
 * The core correctness property is that a replica outage must never fail a
 * request: a read that fails on the replica is transparently retried against
 * the primary, and the replica is taken out of rotation for a cooldown so the
 * failing path is not paid on every subsequent read.
 *
 * `fn` passed to {@link withReadReplica} MUST be read-only. The fallback replays
 * it against the primary, so a write inside `fn` would execute twice.
 */
export class ReadReplicaRouter<C extends ReplicaClientLike> {
  private readonly logger = new Logger(ReadReplicaRouter.name);
  private readonly now: () => number;
  private readonly cooldownMs: number;
  private readonly probeIntervalMs: number;

  private replicaDownUntilMs = 0;
  private lastCheckedAtMs: number | null = null;
  private lastProbeAtMs: number | null = null;
  private lastError: string | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly primary: C,
    private readonly replica: C | null,
    options: ReadReplicaRouterOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_REPLICA_COOLDOWN_MS;
    this.probeIntervalMs =
      options.probeIntervalMs ?? DEFAULT_REPLICA_PROBE_INTERVAL_MS;
  }

  /** True when a replica exists and is not inside its failure cooldown. */
  isReplicaUsable(): boolean {
    return this.replica !== null && this.now() >= this.replicaDownUntilMs;
  }

  /** The client reads should use right now. Always safe to query. */
  getReadClient(): C {
    return this.isReplicaUsable() ? (this.replica as C) : this.primary;
  }

  /**
   * Run a read-only `fn` against the replica, falling back to the primary if
   * the replica is disabled, in cooldown, or fails mid-flight.
   */
  async withReadReplica<T>(fn: (client: C) => Promise<T>): Promise<T> {
    const client = this.getReadClient();
    if (client === this.primary) {
      return fn(this.primary);
    }

    try {
      const result = await fn(client);
      this.markSuccess();
      return result;
    } catch (err) {
      // Fail open. A replica is a read-capacity optimisation, never a hard
      // dependency: log it, take it out of rotation, and serve from primary.
      this.markFailure(err);
      this.logger.warn(
        `Read replica failed (${describeError(err)}); serving this read from the primary`,
      );
      return fn(this.primary);
    }
  }

  /**
   * Probe the replica and refresh its status. Rate-limited to one probe per
   * `probeIntervalMs`; within that window the cached verdict is returned.
   */
  async pingReplica(): Promise<boolean> {
    if (!this.replica) {
      return false;
    }

    const nowMs = this.now();
    if (
      this.lastProbeAtMs !== null &&
      nowMs - this.lastProbeAtMs < this.probeIntervalMs
    ) {
      return this.isReplicaUsable();
    }
    this.lastProbeAtMs = nowMs;

    try {
      await this.replica.$connect();
      this.markSuccess();
      return true;
    } catch (err) {
      this.markFailure(err);
      return false;
    }
  }

  markSuccess(): void {
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.replicaDownUntilMs = 0;
    this.lastCheckedAtMs = this.now();
  }

  markFailure(err: unknown): void {
    this.consecutiveFailures += 1;
    this.lastError = describeError(err);
    this.lastCheckedAtMs = this.now();
    this.replicaDownUntilMs = this.lastCheckedAtMs + this.cooldownMs;
  }

  getStatus(): ReplicaStatus {
    return {
      enabled: this.replica !== null,
      inUse: this.isReplicaUsable(),
      healthy: this.replica !== null && this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures,
      lastCheckedAt:
        this.lastCheckedAtMs === null
          ? null
          : new Date(this.lastCheckedAtMs).toISOString(),
      lastError: this.lastError,
      cooldownRemainingMs: Math.max(0, this.replicaDownUntilMs - this.now()),
    };
  }
}
