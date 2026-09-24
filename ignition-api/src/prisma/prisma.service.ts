import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { QueryMetricsService } from './query-metrics.service';

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 500;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly queryMetrics: QueryMetricsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL');

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
    await this.$disconnect();
  }

  async enableShutdownHooks(app: any): Promise<void> {
    // Interface helper for Prisma shutdown hooks compatibility
  }
}
