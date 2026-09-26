import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { QUEUE_EMAIL } from '../queue.constants';
import {
  EMAIL_JOB_SEND_NOTIFICATION,
  EMAIL_JOB_SEND_VERIFICATION,
  SendNotificationEmailPayload,
  SendVerificationEmailPayload,
} from '../queue.jobs';

@Processor(QUEUE_EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  @Process(EMAIL_JOB_SEND_VERIFICATION)
  async handleVerification(
    job: Job<SendVerificationEmailPayload>,
  ): Promise<void> {
    const { to, token, userId } = job.data;

    if (!to || !token || !userId) {
      throw new Error('Missing required fields for verification email job');
    }

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: EMAIL_JOB_SEND_VERIFICATION,
        to,
        userId,
      }),
    );

    // Delivery is logged here until an SMTP provider is wired in.
    this.logger.debug(
      `Verification email queued for ${to} (user ${userId}, token length ${token.length})`,
    );
  }

  @Process(EMAIL_JOB_SEND_NOTIFICATION)
  async handleNotification(
    job: Job<SendNotificationEmailPayload>,
  ): Promise<void> {
    const { to, subject, body } = job.data;

    if (!to || !subject || !body) {
      throw new Error('Missing required fields for notification email job');
    }

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: EMAIL_JOB_SEND_NOTIFICATION,
        to,
        subject,
      }),
    );

    this.logger.debug(`Notification email queued for ${to}: ${subject}`);
  }
}
