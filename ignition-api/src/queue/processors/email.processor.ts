import { Process, Processor } from '@nestjs/bull';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import { QUEUE_EMAIL } from '../queue.constants';
import {
  EMAIL_JOB_SEND_EMAIL,
  EMAIL_JOB_SEND_NOTIFICATION,
  EMAIL_JOB_SEND_VERIFICATION,
  SendEmailPayload,
  SendNotificationEmailPayload,
  SendVerificationEmailPayload,
} from '../queue.jobs';

/**
 * Permanent / unrecoverable email delivery error.
 * Jobs throwing this error are discarded immediately without Bull retries.
 */
export class UnrecoverableEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecoverableEmailError';
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Processor(QUEUE_EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Validate email format defensively.
   */
  private isValidEmail(address: string | undefined | null): boolean {
    if (!address || typeof address !== 'string') return false;
    return EMAIL_REGEX.test(address.trim());
  }

  /**
   * Resolve FROM address from payload, configuration, or environment.
   */
  private resolveFromAddress(customFrom?: string): string {
    return (
      customFrom ||
      this.config?.get<string>('EMAIL_FROM') ||
      this.config?.get<string>('SMTP_FROM') ||
      process.env.EMAIL_FROM ||
      process.env.SMTP_FROM ||
      'noreply@ignition-pay.org'
    );
  }

  /**
   * Discard job retries on permanent failures (Issue #810).
   * Prevents BullMQ / Bull from retry-storming the SMTP provider on invalid
   * FROM addresses or unrecoverable template / configuration errors.
   */
  private handlePermanentFailure(job: Job, error: Error): never {
    if (typeof job?.discard === 'function') {
      job.discard();
    }
    this.logger.error(
      `Permanent email failure for job ${job.id} on queue ${QUEUE_EMAIL}: ${error.message}. ` +
        `Job discarded to prevent retry storm.`,
    );
    throw error;
  }

  /**
   * Validate FROM and TO addresses before attempting delivery.
   */
  private validateAddresses(job: Job, from: string, to: string): void {
    if (!this.isValidEmail(from)) {
      this.handlePermanentFailure(
        job,
        new UnrecoverableEmailError(
          `Misconfigured or invalid FROM address: "${from}"`,
        ),
      );
    }
    if (!this.isValidEmail(to)) {
      this.handlePermanentFailure(
        job,
        new UnrecoverableEmailError(`Invalid recipient TO address: "${to}"`),
      );
    }
  }

  @Process(EMAIL_JOB_SEND_VERIFICATION)
  async handleVerification(
    job: Job<SendVerificationEmailPayload>,
  ): Promise<void> {
    const { to, token, userId, from: customFrom } = job.data;

    if (!to || !token || !userId) {
      throw new Error('Missing required fields for verification email job');
    }

    const from = this.resolveFromAddress(customFrom);
    this.validateAddresses(job, from, to);

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: EMAIL_JOB_SEND_VERIFICATION,
        from,
        to,
        userId,
      }),
    );

    // Delivery is logged here until an SMTP provider is wired in.
    this.logger.debug(
      `Verification email queued for ${to} from ${from} (user ${userId}, token length ${token.length})`,
    );
  }

  @Process(EMAIL_JOB_SEND_NOTIFICATION)
  async handleNotification(
    job: Job<SendNotificationEmailPayload>,
  ): Promise<void> {
    const { to, subject, body, from: customFrom } = job.data;

    if (!to || !subject || !body) {
      throw new Error('Missing required fields for notification email job');
    }

    const from = this.resolveFromAddress(customFrom);
    this.validateAddresses(job, from, to);

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: EMAIL_JOB_SEND_NOTIFICATION,
        from,
        to,
        subject,
      }),
    );

    this.logger.debug(`Notification email queued for ${to} from ${from}: ${subject}`);
  }

  @Process(EMAIL_JOB_SEND_EMAIL)
  async handleSendEmail(job: Job<SendEmailPayload>): Promise<void> {
    const { to, subject, from: customFrom } = job.data;

    if (!to || !subject) {
      throw new Error('Missing required fields for send_email job');
    }

    const from = this.resolveFromAddress(customFrom);
    this.validateAddresses(job, from, to);

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_EMAIL,
        jobId: job.id,
        jobName: EMAIL_JOB_SEND_EMAIL,
        from,
        to,
        subject,
      }),
    );

    this.logger.debug(`Email queued for ${to} from ${from}: ${subject}`);
  }
}
