import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_PAYMENTS } from '../queue.constants';
import { PAYMENT_JOB_PROCESS, PaymentJobPayload } from '../queue.jobs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Non-retryable error messages — when the Stellar submission fails for one of
 * these reasons there is no point retrying; the payment must move to FAILED
 * immediately (Issue #410).
 */
const NON_RETRYABLE_MESSAGES = [
  'op_already_existing',
  'tx_bad_seq',
  'tx_insufficient_fee',
  'tx_not_allowed',
  'tx_no_source_account',
  'tx_internal_error',
  'tx_malformed',
];

function isNonRetryableError(err: Error): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return NON_RETRYABLE_MESSAGES.some((needle) => msg.includes(needle));
}

@Processor(QUEUE_PAYMENTS)
export class PaymentProcessor {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Processes an outgoing payment job.
   *
   * Responsibilities (to be implemented as Stellar SDK integration is added):
   *  1. Load the persisted Transaction record.
   *  2. Submit the Stellar transaction to Horizon.
   *  3. Update the Transaction status to COMPLETED (or FAILED on error).
   *
   * The job retries up to 3 times with exponential back-off (configured in
   * QueueModule's defaultJobOptions) before being moved to the dead-letter set.
   */
  @Process(PAYMENT_JOB_PROCESS)
  async handlePayment(job: Job<PaymentJobPayload>): Promise<void> {
    const { transactionId, senderWalletId, recipientAddress, amount, assetCode } =
      job.data;

    this.logger.log(
      `Processing payment job ${job.id}: txn=${transactionId} ` +
        `from=${senderWalletId} to=${recipientAddress} ` +
        `amount=${amount} ${assetCode}`,
    );

    try {
      // ── 1. Mark as PROCESSING ────────────────────────────────────────────
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'PROCESSING', statusUpdatedAt: new Date() },
      });

      // ── 2. TODO: Submit to Stellar Horizon ──────────────────────────────
      // When the Stellar SDK integration lands, replace this with the actual
      // Horizon submission and store the returned stellarTxHash.
      //
      // const result = await stellarServer.submitTransaction(...);
      // await this.prisma.transaction.update({
      //   where: { id: transactionId },
      //   data: { stellarTxHash: result.hash, status: 'COMPLETED' },
      // });

      // Placeholder: mark COMPLETED once the SDK integration is wired in.
      // For now we just log so the processor doesn't silently no-op.
      this.logger.warn(
        `Payment job ${job.id}: Stellar SDK integration pending — ` +
          `marking txn ${transactionId} as COMPLETED (placeholder)`,
      );
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'COMPLETED', statusUpdatedAt: new Date() },
      });
    } catch (err: any) {
      this.logger.error(
        `Payment job ${job.id} failed for txn ${transactionId}: ${err.message}`,
        err.stack,
      );

      // ── Issue #410: Transition to terminal FAILED on non-retryable errors ──
      // If the error is non-retryable (e.g. bad sequence, already existing),
      // immediately mark the transaction as FAILED instead of leaving it
      // stuck in PENDING/PROCESSING through all retry attempts.
      if (isNonRetryableError(err)) {
        this.logger.warn(
          `Non-retryable error for txn ${transactionId} — marking FAILED immediately`,
        );
        await this.prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'FAILED',
            statusUpdatedAt: new Date(),
            metadata: {
              ...(await this.prisma.transaction.findUnique({
                where: { id: transactionId },
                select: { metadata: true },
              }))?.metadata as Record<string, unknown>,
              failedReason: err.message,
              failedAt: new Date().toISOString(),
            },
          },
        });
        // Do NOT re-throw — Bull will not retry and the job completes.
        return;
      }

      // Re-throw for retryable errors — Bull will apply exponential back-off.
      throw err;
    }
  }

  // ── Issue #412: Dead-letter handling ───────────────────────────────────
  // When a Bull job exhausts all retries, OnQueueFailed fires. We log the
  // failure with full context so it can be picked up by alerting / monitoring
  // instead of silently dropping the job.
  @OnQueueFailed()
  onJobFailed(job: Job<PaymentJobPayload>, err: Error): void {
    this.logger.error(
      `Payment job ${job.id} permanently failed after ${job.attemptsMade} ` +
        `attempt(s): txn=${job.data.transactionId} — ${err.message}`,
      err.stack,
    );

    // Best-effort: mark the transaction as FAILED so it is never stuck in
    // PENDING/PROCESSING. This is the safety-net for jobs that were not
    // already transitioned by the non-retryable guard above.
    this.prisma.transaction
      .update({
        where: { id: job.data.transactionId },
        data: {
          status: 'FAILED',
          statusUpdatedAt: new Date(),
          metadata: {
            ...(this.prisma.transaction.findUnique({
              where: { id: job.data.transactionId },
              select: { metadata: true },
            }) as any)?.metadata ?? {},
            deadLetterReason: err.message,
            deadLetterAt: new Date().toISOString(),
            attemptsMade: job.attemptsMade,
          },
        },
      })
      .catch((updateErr) => {
        this.logger.error(
          `Failed to mark txn ${job.data.transactionId} as FAILED in dead-letter handler: ${updateErr.message}`,
        );
      });
  }

  @OnQueueCompleted()
  onJobCompleted(job: Job<PaymentJobPayload>): void {
    this.logger.log(
      `Payment job ${job.id} completed: txn=${job.data.transactionId}`,
    );
  }
}
