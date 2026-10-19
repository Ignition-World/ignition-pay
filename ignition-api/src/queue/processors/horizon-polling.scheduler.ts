import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_HORIZON } from '../queue.constants';
import { HORIZON_JOB_CHECK_TX, HorizonCheckTxPayload } from '../queue.jobs';

/**
 * Issue #243 — Persist transaction status from chain.
 *
 * On startup (and via a recurring setInterval) this scheduler scans for
 * Transaction rows that are still PENDING or PROCESSING and enqueues a
 * Horizon polling job for each, so their status is eventually finalised.
 *
 * The polling interval is controlled by the HORIZON_POLL_INTERVAL_MS env var
 * (default: 30 000 ms).  Bull's per-queue retry + back-off takes care of
 * transient Horizon unavailability.
 */
@Injectable()
export class HorizonPollingScheduler implements OnModuleInit {
  private readonly logger = new Logger(HorizonPollingScheduler.name);
  private readonly pollIntervalMs: number;

  constructor(
    @InjectQueue(QUEUE_HORIZON) private readonly horizonQueue: Queue,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.pollIntervalMs = Number(
      config.get<number>('HORIZON_POLL_INTERVAL_MS') ?? 30_000,
    );
  }

  async onModuleInit(): Promise<void> {
    // Run once at startup then schedule periodic sweeps.
    await this.enqueuePendingTransactions();
    setInterval(() => void this.enqueuePendingTransactions(), this.pollIntervalMs);
  }

  /**
   * Finds all PENDING / PROCESSING transactions that have a stellarTxHash
   * and schedules a Horizon check job for each one not already queued.
   */
  private async enqueuePendingTransactions(): Promise<void> {
    try {
      const pending = await this.prisma.transaction.findMany({
        where: {
          status: { in: ['PENDING', 'PROCESSING'] },
          stellarTxHash: { not: null },
        },
        select: { id: true, stellarTxHash: true },
      });

      if (pending.length === 0) return;

      this.logger.debug(
        `Scheduling Horizon checks for ${pending.length} PENDING transaction(s).`,
      );

      for (const tx of pending) {
        const jobId = `horizon-check-${tx.id}`;

        // Avoid duplicating jobs that are already waiting.
        const existing = await this.horizonQueue.getJob(jobId);
        if (existing) continue;

        const payload: HorizonCheckTxPayload = {
          transactionId: tx.id,
          stellarTxHash: tx.stellarTxHash ?? undefined,
        };

        await this.horizonQueue.add(HORIZON_JOB_CHECK_TX, payload, {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: false,
        });
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to enqueue Horizon polling jobs: ${err?.message ?? err}`,
      );
    }
  }
}
