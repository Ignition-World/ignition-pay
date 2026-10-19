import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

@Processor('analytics')
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);
  private readonly DEDUP_TTL_SECONDS = 86400; // 24 hours retention

  constructor(@InjectRedis() private readonly redis: Redis) {}

  @Process('process-event')
  async handleAnalyticsEvent(job: Job<{ eventId: string; metricKey: string; value: number }>) {
    const { eventId, metricKey, value } = job.data;

    if (!eventId) {
      this.logger.warn(`Received analytics job without eventId: ${job.id}`);
      return;
    }

    const dedupKey = `analytics:processed:${eventId}`;

    // 1. Check idempotency lock / processed cache atomically using SET NX
    const acquired = await this.redis.set(dedupKey, 'locked', 'EX', this.DEDUP_TTL_SECONDS, 'NX');

    if (!acquired) {
      this.logger.warn(`Duplicate analytics event detected and skipped: ${eventId}`);
      return; // Gracefully acknowledge duplicate job without double-counting
    }

    try {
      // 2. Execute idempotent or atomic aggregate update
      await this.applyMetricAggregate(metricKey, value);
      this.logger.verbose(`Successfully processed analytics event: ${eventId}`);
    } catch (error) {
      // Release lock on processing failure so it can be safely retried if needed
      await this.redis.del(dedupKey);
      throw error;
    }
  }

  private async applyMetricAggregate(metricKey: string, value: number): Promise<void> {
    // Database or timeseries aggregate increment logic
    // e.g., upsert or atomic increment backed by unique constraint
  }
}