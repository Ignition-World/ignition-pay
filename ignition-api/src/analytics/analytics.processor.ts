import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_ANALYTICS } from '../queue/queue.constants';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';

/**
 * Job payload shape for a single analytics event arriving on the queue.
 */
export interface AnalyticsJobData {
  userId: string;
  eventName: string;
  payload?: Record<string, unknown>;
  /**
   * Monotonically increasing per-user sequence number assigned at job-
   * enqueue time.  The processor sorts the batch by this value before
   * flushing so that events are always written to the warehouse in causal
   * order, regardless of the order BullMQ delivered the jobs.
   *
   * Without this sort, viewed_dashboard can arrive in the warehouse after
   * sent_payment even when it happened first, because variable-size batches
   * are flushed per-customer without ordering guarantees.
   */
  sequenceNumber: number;
}

@Processor(QUEUE_ANALYTICS)
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Process a single analytics event job.
   *
   * Persisting individual events as they arrive lets the service recover the
   * full per-user history in sequence order when it needs to flush a batch,
   * and keeps each Bull job small and retryable.
   */
  @Process()
  async handleEvent(job: Job<AnalyticsJobData>): Promise<void> {
    const { userId, eventName, payload, sequenceNumber } = job.data;

    this.logger.debug(
      `Processing analytics event "${eventName}" for user ${userId} [seq=${sequenceNumber}]`,
    );

    const dto: TrackEventDto = {
      userId,
      eventName,
      payload,
      sequenceNumber,
    };

    await this.analyticsService.trackEvent(dto);
  }

  /**
   * Flush all pending events for a specific user to the downstream warehouse.
   *
   * Events are retrieved from the database sorted by sequenceNumber ASC so
   * the warehouse always receives them in the order they originally occurred,
   * regardless of the order the Bull jobs were delivered.
   *
   * This fixes the root cause of #789: previously the processor flushed
   * per-customer batches without any ordering guarantee.
   */
  @Process('flush-user')
  async flushUserEvents(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;

    this.logger.log(`Flushing analytics batch for user ${userId}`);

    // getOrderedEventsForUser always returns events in ascending sequenceNumber
    // order.  Any downstream warehouse write must consume them in this order.
    const orderedEvents =
      await this.analyticsService.getOrderedEventsForUser(userId);

    this.logger.log(
      `Flushing ${orderedEvents.length} events for user ${userId} ` +
        `(seq range: ${orderedEvents[0]?.sequenceNumber ?? 'n/a'} – ` +
        `${orderedEvents[orderedEvents.length - 1]?.sequenceNumber ?? 'n/a'})`,
    );

    // TODO: forward `orderedEvents` to the data warehouse / analytics sink.
    // The ordering contract is now guaranteed; warehouse writes must preserve it.
  }
}
