import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

import { DataExportService } from '../../users/data-export.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_DATA_EXPORT } from '../queue.constants';
import { DATA_EXPORT_JOB_GENERATE, DataExportPayload } from '../queue.jobs';

/**
 * Issue #619 — GDPR data export.
 *
 * Builds the gzipped, HMAC-signed JSON archive for a user, records an audit
 * log entry and notifies the user that their export is ready to download.
 */
@Processor(QUEUE_DATA_EXPORT)
export class DataExportProcessor {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly dataExport: DataExportService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Process(DATA_EXPORT_JOB_GENERATE)
  async generate(job: Job<DataExportPayload>): Promise<void> {
    const { userId, requestedBy } = job.data;

    if (!userId) {
      throw new Error('Missing required userId for data export job');
    }

    const artifact = await this.dataExport.generateExport(userId);

    await this.prisma.auditLog.create({
      data: {
        userId: requestedBy ?? userId,
        action: 'ADMIN_ACTION',
        resourceType: 'User',
        resourceId: userId,
        details: JSON.stringify({
          action: 'DATA_EXPORT_GENERATED',
          token: artifact.token,
          expiresAt: artifact.expiresAt.toISOString(),
        }),
      },
    });

    await this.notifications.create({
      userId,
      type: 'CAMPAIGN_UPDATED',
      title: 'Your data export is ready',
      message:
        'Your personal data export has been generated. The download link expires in 24 hours.',
      relatedId: artifact.token,
    });

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_DATA_EXPORT,
        jobId: job.id,
        jobName: DATA_EXPORT_JOB_GENERATE,
        userId,
        requestedBy,
        expiresAt: artifact.expiresAt.toISOString(),
      }),
    );
  }
}
