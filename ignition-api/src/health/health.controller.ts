import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { PrismaService } from '../prisma/prisma.service';
import { QueryMetricsService } from '../prisma/query-metrics.service';
import { ConfigService } from '@nestjs/config';
import { ShutdownState } from '../common/shutdown/shutdown.state';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly config: ConfigService,
    private readonly queryMetrics: QueryMetricsService,
    private readonly shutdownState: ShutdownState,
  ) {}

  /** Liveness probe — returns 200 when the process is running, 503 while shutting down. */
  @Get()
  @HealthCheck()
  check() {
    if (this.shutdownState.isShuttingDown) {
      throw new ServiceUnavailableException('Server is shutting down');
    }

    const horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisHealth.isHealthy('redis'),
      () => this.http.pingCheck('stellar_horizon', horizonUrl),
      () => this.poolIndicator(),
    ]);
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

  private poolIndicator() {
    const status = this.prisma.getPoolStatus();
    return Promise.resolve({
      database_pool: {
        status: status.exhausted ? 'degraded' : 'up',
        ...status,
      },
    });
  /** p50/p95/p99 latency per Prisma model.action, tracked in-memory. */
  @Get('query-metrics')
  queryMetricsSnapshot() {
    return this.queryMetrics.getPercentiles();
  }
}
