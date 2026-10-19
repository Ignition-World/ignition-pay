import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_ANALYTICS } from '../queue.constants';
import { ANALYTICS_JOB_TRACK, AnalyticsEventPayload } from '../queue.jobs';

@Processor(QUEUE_ANALYTICS)
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process(ANALYTICS_JOB_TRACK)
  async trackEvent(job: Job<AnalyticsEventPayload>): Promise<void> {
    const { event, userId, properties } = job.data;

    if (!event) {
      throw new Error('Missing required analytics event name');
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'ADMIN_ACTION',
        resourceType: 'Analytics',
        resourceId: event,
        details: JSON.stringify({ event, properties }),
      },
    });

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_ANALYTICS,
        jobId: job.id,
        jobName: ANALYTICS_JOB_TRACK,
        event,
        userId,
      }),
    );
  }
}
