import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import type { Queue } from 'bull';
import {
  QUEUE_EMAIL,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_ANALYTICS,
  QUEUE_PAYMENTS,
  QUEUE_HORIZON,
} from '../queue/queue.constants';

/**
 * Health of the Bull queue manager (issue #621).
 *
 * The queue manager runs on the same Redis as the `redis` indicator, so a
 * reachable Redis says nothing about whether the queues themselves are
 * usable. `Queue#getJobCounts()` is a real round trip against the queue's
 * Redis keys, which is what makes this check worth having separately: it
 * reports per-queue backlog as well as reachability, and it fails if a queue's
 * keys are blocked, unreachable, or not the type Bull expects.
 *
 * Mirrors `RedisHealthIndicator`: extends `HealthIndicator`, resolves through
 * `getStatus()`, and signals failure by throwing `HealthCheckError`.
 */
@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_CONTRACT_EVENTS)
    private readonly contractEventsQueue: Queue,
    @InjectQueue(QUEUE_ANALYTICS) private readonly analyticsQueue: Queue,
    @InjectQueue(QUEUE_PAYMENTS) private readonly paymentsQueue: Queue,
    @InjectQueue(QUEUE_HORIZON) private readonly horizonQueue: Queue,
  ) {
    super();
  }

  private queues(): Record<string, Queue> {
    return {
      [QUEUE_EMAIL]: this.emailQueue,
      [QUEUE_CONTRACT_EVENTS]: this.contractEventsQueue,
      [QUEUE_ANALYTICS]: this.analyticsQueue,
      [QUEUE_PAYMENTS]: this.paymentsQueue,
      [QUEUE_HORIZON]: this.horizonQueue,
    };
  }

  /** @param key health result key, defaults to `queue` */
  async isHealthy(key = 'queue'): Promise<HealthIndicatorResult> {
    const queues = this.queues();
    const details: Record<string, unknown> = {};
    const failed: string[] = [];

    // Queues are independent, so probe them concurrently rather than paying
    // the sum of five round trips.
    await Promise.all(
      Object.entries(queues).map(async ([name, queue]) => {
        try {
          const counts = await queue.getJobCounts();
          details[name] = { status: 'up', ...counts };
        } catch (err) {
          failed.push(name);
          details[name] = {
            status: 'down',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    if (failed.length > 0) {
      throw new HealthCheckError(
        `Queue check failed for: ${failed.join(', ')}`,
        this.getStatus(key, false, details),
      );
    }

    return this.getStatus(key, true, details);
  }
}
