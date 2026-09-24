import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_EMAIL, QUEUE_HORIZON } from '../queue/queue.constants';
import {
  EMAIL_JOB_SEND_NOTIFICATION,
  HORIZON_JOB_CHECK_TX,
} from '../queue/queue.jobs';

const DEFAULT_PENDING_TIMEOUT_MINUTES = 30;
const DEFAULT_PROCESSING_TIMEOUT_MINUTES = 15;

/**
 * Issue #603 — sweeps for Transaction rows stuck in PENDING/PROCESSING and
 * either fails them out or re-queues a Horizon check, every 5 minutes.
 *
 * Timeout thresholds are configurable via env vars (STALE_TX_PENDING_TIMEOUT_MINUTES
 * / STALE_TX_PROCESSING_TIMEOUT_MINUTES) rather than SystemSettings — adding
 * columns there would require a Prisma migration against a live database,
 * which this change doesn't have access to run.
 */
@Injectable()
export class StaleTransactionMonitorService {
  private readonly logger = new Logger(StaleTransactionMonitorService.name);
  private readonly pendingTimeoutMinutes: number;
  private readonly processingTimeoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_HORIZON) private readonly horizonQueue: Queue,
  ) {
    this.pendingTimeoutMinutes = Number(
      this.config.get<number>(
        'STALE_TX_PENDING_TIMEOUT_MINUTES',
        DEFAULT_PENDING_TIMEOUT_MINUTES,
      ),
    );
    this.processingTimeoutMinutes = Number(
      this.config.get<number>(
        'STALE_TX_PROCESSING_TIMEOUT_MINUTES',
        DEFAULT_PROCESSING_TIMEOUT_MINUTES,
      ),
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    await Promise.all([this.failStalePending(), this.requeueStaleProcessing()]);
  }

  /** Count of stale (past-threshold) PENDING + PROCESSING transactions, for admin visibility. */
  async countStale(): Promise<{ pending: number; processing: number }> {
    const [pending, processing] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          status: 'PENDING',
          createdAt: { lt: this.minutesAgo(this.pendingTimeoutMinutes) },
        },
      }),
      this.prisma.transaction.count({
        where: {
          status: 'PROCESSING',
          createdAt: { lt: this.minutesAgo(this.processingTimeoutMinutes) },
        },
      }),
    ]);
    return { pending, processing };
  }

  private async failStalePending(): Promise<void> {
    const stale = await this.prisma.transaction.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: this.minutesAgo(this.pendingTimeoutMinutes) },
      },
      select: {
        id: true,
        fromWallet: { select: { user: { select: { id: true, email: true } } } },
      },
    });

    if (stale.length === 0) {
      return;
    }

    await this.prisma.transaction.updateMany({
      where: { id: { in: stale.map((t) => t.id) } },
      data: { status: 'FAILED', statusUpdatedAt: new Date() },
    });

    this.logger.warn(
      `Marked ${stale.length} stale PENDING transaction(s) as FAILED (>${this.pendingTimeoutMinutes}m old)`,
    );

    await Promise.all(
      stale
        .filter((t) => t.fromWallet.user?.email)
        .map((t) =>
          this.emailQueue.add(EMAIL_JOB_SEND_NOTIFICATION, {
            to: t.fromWallet.user!.email!,
            subject: 'Transaction failed',
            body: `Your transaction ${t.id} timed out and was marked as failed after being pending for more than ${this.pendingTimeoutMinutes} minutes.`,
          }),
        ),
    );
  }

  private async requeueStaleProcessing(): Promise<void> {
    const stale = await this.prisma.transaction.findMany({
      where: {
        status: 'PROCESSING',
        createdAt: { lt: this.minutesAgo(this.processingTimeoutMinutes) },
      },
      select: { id: true, stellarTxHash: true },
    });

    if (stale.length === 0) {
      return;
    }

    this.logger.warn(
      `Re-queueing ${stale.length} stale PROCESSING transaction(s) for a Horizon check (>${this.processingTimeoutMinutes}m old)`,
    );

    await Promise.all(
      stale.map((t) =>
        this.horizonQueue.add(
          HORIZON_JOB_CHECK_TX,
          { transactionId: t.id, stellarTxHash: t.stellarTxHash ?? undefined },
          {
            jobId: `stale-recheck-${t.id}-${Date.now()}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        ),
      ),
    );
  }

  private minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60_000);
  }
}
