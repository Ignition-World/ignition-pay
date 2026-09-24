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
    const baseUrl = process.env.DATABASE_URL ?? '';
    const datasources =
      baseUrl.length > 0
        ? {
            db: {
              url: withPoolParams(baseUrl, poolSize, poolTimeoutMs),
            },
          }
        : undefined;

    super(datasources ? { datasources } : undefined);

    this.poolSize = poolSize;
    this.poolTimeoutMs = poolTimeoutMs;
    this.queueTimeoutMs = queueTimeoutMs;
    this.config = config;
    this.queryMetrics = queryMetrics;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(
      `Prisma connected (pool_size=${this.poolSize}, pool_timeout_ms=${this.poolTimeoutMs}, queue_timeout_ms=${this.queueTimeoutMs})`,
    );
    this.logger.log('Prisma connected to PostgreSQL');

    if (!this.config || !this.queryMetrics) {
      return;
    }

    const slowQueryThresholdMs = this.config.get<number>(
      'SLOW_QUERY_THRESHOLD_MS',
      DEFAULT_SLOW_QUERY_THRESHOLD_MS,
    );

    // Issue #607 — time every query and log ones that exceed the threshold
    // (model, operation, duration) so slow queries are visible without a
    // profiler attached. Percentiles are recorded for all queries,
    // regardless of threshold, via QueryMetricsService.
    this.$use(async (params, next) => {
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
