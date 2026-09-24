import { Controller, Get } from '@nestjs/common';
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
  ) {}

  /** Liveness probe — returns 200 when the process is running. */
  @Get()
  @HealthCheck()
  check() {
    const horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisHealth.isHealthy('redis'),
      () => this.http.pingCheck('stellar_horizon', horizonUrl),
    ]);
  }

  /** Readiness probe — confirms all dependencies are reachable. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.check();
  }

  /** p50/p95/p99 latency per Prisma model.action, tracked in-memory. */
  @Get('query-metrics')
  queryMetricsSnapshot() {
    return this.queryMetrics.getPercentiles();
  }
}
