import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckError,
  HealthIndicatorResult,
  HttpHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { QueueHealthIndicator } from './queue.health';
import { parsePositiveInt, PrismaService } from '../prisma/prisma.service';
import { QueryMetricsService } from '../prisma/query-metrics.service';
import { ConfigService } from '@nestjs/config';
import { ShutdownState } from '../common/shutdown/shutdown.state';
import {
  DEFAULT_DEPENDENCY_TIMEOUT_MS,
  DependencyHealthRegistry,
  DependencyProbeRecord,
  describeError,
  withTimeout,
} from './health-probe';

/**
 * Raw shape returned by a single indicator before it is annotated with probe
 * metadata. Kept loose so each indicator keeps its own concrete result type
 * without forcing a cast at every call site.
 */
type RawIndicatorResult = Record<string, unknown>;

/** Health key of the read-replica probe (issue #599). */
const DATABASE_REPLICA = 'database_replica';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly config: ConfigService,
    private readonly queryMetrics: QueryMetricsService,
    private readonly shutdownState: ShutdownState,
    private readonly queueHealth: QueueHealthIndicator,
    private readonly probes: DependencyHealthRegistry,
  ) {
    this.timeoutMs = parsePositiveInt(
      this.config.get<string>('HEALTH_CHECK_TIMEOUT_MS'),
      DEFAULT_DEPENDENCY_TIMEOUT_MS,
    );
  }

  /**
   * Liveness + dependency probe. Returns 200 while the process is running and
   * every dependency is within its failure threshold; 503 while shutting down,
   * or once a dependency has failed `HEALTH_FAILURE_THRESHOLD` times in a row.
   */
  @Get()
  @HealthCheck()
  async check(): Promise<HealthIndicatorResult> {
    if (this.shutdownState.isShuttingDown) {
      throw new ServiceUnavailableException('Server is shutting down');
    }

    const horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';

    // Terminus runs these thunks concurrently, so the checks were already
    // parallel before this change. What is new is the per-dependency timeout
    // and failure threshold applied by probe(), so one hung socket can no
    // longer hold the whole request open.
    return this.health.check([
      this.probe('database', () =>
        this.prismaHealth.pingCheck('database', this.prisma),
      ),
      this.probe('redis', () => this.redisHealth.isHealthy('redis')),
      this.probe('stellar_horizon', () =>
        this.http.pingCheck('stellar_horizon', horizonUrl),
      ),
      this.probe('database_pool', () => this.poolIndicator()),
      this.probe('queue', () => this.queueHealth.isHealthy()),
      this.probe(DATABASE_REPLICA, () => this.replicaIndicator(), {
        // A dead replica must never take the endpoint down: reads fail open to
        // the primary, so the service is fully functional without one.
        escalate: false,
      }),
      // Cast because terminus infers the payload type from the literal thunks;
      // probe() erases the per-indicator key literals into HealthIndicatorResult.
    ]) as unknown as Promise<HealthIndicatorResult>;
  }

  /** Readiness probe — confirms all dependencies are reachable. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.check();
  }

  /** Dedicated pool status for operators / load dashboards. */
  @Get('pool')
  pool() {
    return this.prisma.getPoolStatus();
  }

  /** Read-replica status (issue #599) for operators / dashboards. */
  @Get('replica')
  replica() {
    return this.prisma.checkReplica();
  }

  /** p50/p95/p99 latency per Prisma model.action, tracked in-memory. */
  @Get('query-metrics')
  queryMetricsSnapshot() {
    return this.queryMetrics.getPercentiles();
  }

  /**
   * Wrap an indicator so it is bounded by the probe timeout, annotated with
   * its latency and last-check timestamp, and only allowed to mark the
   * endpoint down once it has failed `HEALTH_FAILURE_THRESHOLD` times in a row.
   *
   * `escalate: false` keeps a dependency permanently informational: a failure
   * is reported but can never produce a 503.
   *
   * Note on statuses: terminus buckets an indicator's payload purely by its
   * `status` field and only understands 'up' and 'down' — any other value is
   * dropped from the response entirely. A tolerated failure therefore has to
   * be reported as 'up' to keep the endpoint at 200, which is what the
   * separate `degraded` flag is for.
   */
  private probe(
    key: string,
    run: () => Promise<RawIndicatorResult>,
    options: { escalate?: boolean } = {},
  ): () => Promise<HealthIndicatorResult> {
    return async (): Promise<HealthIndicatorResult> => {
      const startedAt = Date.now();

      try {
        // Promise.resolve() so a synchronous indicator result is still raced
        // against the timeout rather than short-circuiting it.
        const result = await withTimeout(
          key,
          Promise.resolve(run()),
          this.timeoutMs,
        );
        return this.annotate(
          key,
          result,
          this.probes.recordSuccess(key, Date.now() - startedAt),
        );
      } catch (err) {
        const failure = this.probes.recordFailure(
          key,
          Date.now() - startedAt,
          err,
        );
        this.logger.debug(
          'Health check ' + key + ' failed: ' + describeError(err),
        );

        // Under the threshold (or non-escalating) the endpoint stays 200.
        if (failure.tolerated || options.escalate === false) {
          return {
            [key]: { status: 'up', degraded: true, ...failure },
          } as HealthIndicatorResult;
        }

        throw new HealthCheckError(key + ' check failed', {
          [key]: { status: 'down', degraded: true, ...failure },
        });
      }
    };
  }

  /** Merge probe metadata into an indicator's own payload, under the same key. */
  private annotate(
    key: string,
    result: RawIndicatorResult,
    record: DependencyProbeRecord,
  ): HealthIndicatorResult {
    const payload = (result?.[key] ?? {}) as Record<string, unknown>;
    return {
      ...result,
      [key]: { ...payload, ...record },
    } as HealthIndicatorResult;
  }

  private poolIndicator() {
    const status = this.prisma.getPoolStatus();
    return Promise.resolve({
      database_pool: {
        // 'up' + degraded rather than a 'degraded' status: terminus would drop
        // a 'degraded' status from the response instead of reporting it.
        status: 'up',
        degraded: status.exhausted,
        ...status,
      },
    });
  }

  /**
   * Issue #599 — report the read replica alongside the primary. A replica that
   * is not configured is `enabled: false` and perfectly healthy; one that is
   * configured but failing is flagged `degraded` and never turns the endpoint
   * red, because reads are already failing open to the primary.
   */
  private async replicaIndicator(): Promise<RawIndicatorResult> {
    const replica = await this.prisma.checkReplica();
    return {
      [DATABASE_REPLICA]: {
        status: 'up',
        degraded: replica.enabled && !replica.healthy,
        ...replica,
      },
    };
  }
}
