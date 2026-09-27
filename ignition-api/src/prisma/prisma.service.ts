import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { QueryMetricsService } from './query-metrics.service';
import { resolveReplicaConfig } from './replica.config';
import { ReadReplicaRouter, ReplicaStatus } from './read-replica.router';

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 500;

const DEFAULT_POOL_SIZE = 10;
const MIN_POOL_SIZE = 5;
const MAX_POOL_SIZE = 20;
const DEFAULT_POOL_TIMEOUT_MS = 10_000;
const DEFAULT_QUEUE_TIMEOUT_MS = 10_000;

export interface PrismaPoolStatus {
  poolSize: number;
  poolTimeoutMs: number;
  queueTimeoutMs: number;
  active: number;
  queued: number;
  available: number;
  exhausted: boolean;
}

type Waiter = {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Clamp configured pool size into the accepted [min, max] range. */
export function clampPoolSize(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_POOL_SIZE;
  return Math.min(MAX_POOL_SIZE, Math.max(MIN_POOL_SIZE, n));
}

export function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Append Prisma datasource pool params to DATABASE_URL.
 * Uses `connection_limit` (pool size) and `pool_timeout` (seconds).
 */
export function withPoolParams(
  databaseUrl: string,
  poolSize: number,
  poolTimeoutMs: number,
): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', String(poolSize));
  url.searchParams.set(
    'pool_timeout',
    String(Math.max(1, Math.ceil(poolTimeoutMs / 1000))),
  );
  return url.toString();
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  readonly poolSize: number;
  readonly poolTimeoutMs: number;
  readonly queueTimeoutMs: number;

  private readonly config?: ConfigService;
  private readonly queryMetrics?: QueryMetricsService;

  private active = 0;
  private queued = 0;
  private readonly waitQueue: Waiter[] = [];

  /** Issue #599 — read replica. Null when DATABASE_REPLICA_URL is unset. */
  private readonly replicaClient: PrismaClient | null;
  private readonly replicaRouter: ReadReplicaRouter<PrismaClient>;

  constructor(config?: ConfigService, queryMetrics?: QueryMetricsService) {
    const poolSize = clampPoolSize(process.env.PRISMA_POOL_SIZE);
    const poolTimeoutMs = parsePositiveInt(
      process.env.PRISMA_POOL_TIMEOUT_MS,
      DEFAULT_POOL_TIMEOUT_MS,
    );
    const queueTimeoutMs = parsePositiveInt(
      process.env.PRISMA_QUEUE_TIMEOUT_MS,
      DEFAULT_QUEUE_TIMEOUT_MS,
    );
    // DATABASE_PRIMARY_URL / DATABASE_REPLICA_URL fall back to DATABASE_URL
    // (replica unset => primary-only, so existing deployments are unaffected).
    const { primaryUrl, replicaUrl, replicaEnabled } =
      resolveReplicaConfig(process.env);
    const datasources =
      primaryUrl.length > 0
        ? {
            db: {
              url: withPoolParams(primaryUrl, poolSize, poolTimeoutMs),
            },
          }
        : undefined;

    super(datasources ? { datasources } : undefined);

    this.poolSize = poolSize;
    this.poolTimeoutMs = poolTimeoutMs;
    this.queueTimeoutMs = queueTimeoutMs;
    this.config = config;
    this.queryMetrics = queryMetrics;

    this.replicaClient = replicaEnabled
      ? this.buildReplicaClient(replicaUrl as string)
      : null;
    this.replicaRouter = new ReadReplicaRouter<PrismaClient>(
      this,
      this.replicaClient,
    );
  }

  /**
   * Issue #599 — open a second client against the read replica. Constructed
   * eagerly but never `$connect()`ed at boot: an unreachable replica must not
   * stop the process from starting, so the first read that lands on it is what
   * discovers the failure and trips the router's fallback to the primary.
   */
  private buildReplicaClient(replicaUrl: string): PrismaClient | null {
    try {
      return new PrismaClient({
        datasources: {
          db: {
            url: withPoolParams(replicaUrl, this.poolSize, this.poolTimeoutMs),
          },
        },
      });
    } catch (err) {
      this.logger.error(
        'Failed to create read replica client, continuing primary-only: ' +
          (err as Error).message,
      );
      return null;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(
      `Prisma connected (pool_size=${this.poolSize}, pool_timeout_ms=${this.poolTimeoutMs}, queue_timeout_ms=${this.queueTimeoutMs})`,
    );
    this.logger.log('Prisma connected to PostgreSQL');
    this.logger.log(
      this.replicaRouter.getStatus().enabled
        ? 'Read replica configured (reads may be routed to it)'
        : 'Read replica not configured (primary-only reads)',
    );

    this.installQueryMetrics(this);
    if (this.replicaClient) {
      this.installQueryMetrics(this.replicaClient);
    }
  }

  /**
   * Issue #607 — time every query and log ones that exceed the threshold
   * (model, operation, duration) so slow queries are visible without a
   * profiler attached. Percentiles are recorded for all queries, regardless
   * of threshold, via QueryMetricsService.
   *
   * Applied to the replica client as well so replica-served reads show up in
   * the same percentiles as primary reads.
   */
  private installQueryMetrics(client: PrismaClient): void {
    if (!this.config || !this.queryMetrics) {
      return;
    }

    const slowQueryThresholdMs = this.config.get<number>(
      'SLOW_QUERY_THRESHOLD_MS',
      DEFAULT_SLOW_QUERY_THRESHOLD_MS,
    );

    client.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const durationMs = Date.now() - start;
      const key = `${params.model ?? 'raw'}.${params.action}`;

      this.queryMetrics.record(key, durationMs);

      if (durationMs > slowQueryThresholdMs) {
        this.logger.warn(
          `Slow query: ${key} took ${durationMs}ms (threshold ${slowQueryThresholdMs}ms)`,
        );
      }

      return result;
    });
  }

  async onModuleDestroy(): Promise<void> {
    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      clearTimeout(waiter.timer);
      waiter.reject(
        new ServiceUnavailableException('Prisma connection pool shutting down'),
      );
    }
    await this.$disconnect();
    if (this.replicaClient) {
      await this.replicaClient.$disconnect().catch((err) => {
        this.logger.warn(
          'Read replica disconnect failed during shutdown: ' +
            (err as Error).message,
        );
      });
    }
  }

  async enableShutdownHooks(_app: unknown): Promise<void> {
    // Interface helper for Prisma shutdown hooks compatibility
  }

  /** Snapshot of application-level pool / queue pressure for health probes. */
  getPoolStatus(): PrismaPoolStatus {
    return {
      poolSize: this.poolSize,
      poolTimeoutMs: this.poolTimeoutMs,
      queueTimeoutMs: this.queueTimeoutMs,
      active: this.active,
      queued: this.queued,
      available: Math.max(0, this.poolSize - this.active),
      exhausted: this.active >= this.poolSize,
    };
  }

  // -------------------------------------------------------------------------
  // Read replicas (issue #599)
  // -------------------------------------------------------------------------
  /**
   * True when a read replica is configured. False in every deployment that
   * only sets DATABASE_URL, in which case reads run against the primary.
   */
  isReplicaEnabled(): boolean {
    return this.replicaRouter.getStatus().enabled;
  }

  /**
   * The client a read should currently use: the replica when it is configured
   * and healthy, otherwise the primary. Always safe to query — this never
   * returns a client that is known to be broken.
   */
  getReadClient(): PrismaClient {
    return this.replicaRouter.getReadClient();
  }

  /**
   * Run a **read-only** query against the read replica, transparently falling
   * back to the primary when the replica is unavailable.
   *
   * Prefer this over `getReadClient()` so a mid-flight replica failure is
   * absorbed and the replica is taken out of rotation, rather than surfacing
   * as a request error.
   *
   * Read-your-writes: replication lag means a replica can briefly lack a row
   * that was just written. Any read that must observe a write this process
   * just performed has to run on the primary — use `this.<model>` (or
   * `withPrimary`) for those, not this method.
   */
  async withReadReplica<T>(
    fn: (client: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.replicaRouter.withReadReplica(fn);
  }

  /** Run a read against the primary, skipping the replica entirely. */
  async withPrimary<T>(fn: (client: PrismaService) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /** Current replica status without triggering a probe. */
  getReplicaStatus(): ReplicaStatus {
    return this.replicaRouter.getStatus();
  }

  /**
   * Probe the replica and return its refreshed status. Rate-limited to one
   * probe per `REPLICA_PROBE_INTERVAL_MS` (default 5s) so a health poll storm
   * cannot turn into a connection storm.
   */
  async checkReplica(): Promise<ReplicaStatus> {
    await this.replicaRouter.pingReplica();
    return this.replicaRouter.getStatus();
  }

  /**
   * Run work under a bounded pool slot. When the pool is full, requests queue
   * until a slot frees or `PRISMA_QUEUE_TIMEOUT_MS` elapses (no indefinite hang).
   */
  async withPoolSlot<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await fn();
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.active < this.poolSize) {
      this.active += 1;
      return;
    }

    this.queued += 1;
    try {
      await new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const idx = this.waitQueue.indexOf(waiter);
            if (idx >= 0) this.waitQueue.splice(idx, 1);
            reject(
              new ServiceUnavailableException(
                `Prisma connection pool exhausted (queued timeout after ${this.queueTimeoutMs}ms)`,
              ),
            );
          }, this.queueTimeoutMs),
        };
        this.waitQueue.push(waiter);
      });
      // Slot transferred from a releaser — `active` already accounts for us.
    } finally {
      this.queued = Math.max(0, this.queued - 1);
    }
  }

  private releaseSlot(): void {
    const next = this.waitQueue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }
}
