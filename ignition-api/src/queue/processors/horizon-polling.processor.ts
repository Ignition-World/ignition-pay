import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_HORIZON } from '../queue.constants';
import {
  HORIZON_JOB_CHECK_TX,
  HorizonCheckTxPayload,
} from '../queue.jobs';

/**
 * Issue #243 — Persist transaction status from chain.
 *
 * This processor is enqueued for every PENDING Transaction record.  It calls
 * Horizon to check whether the corresponding Stellar transaction has been
 * confirmed (or failed) and updates the local row accordingly, so transactions
 * no longer stay stuck in PENDING after submission.
 */
@Processor(QUEUE_HORIZON)
export class HorizonPollingProcessor {
  private readonly logger = new Logger(HorizonPollingProcessor.name);
  private readonly server: InstanceType<typeof StellarSdk.Server>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const horizonUrl =
      config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    this.server = new StellarSdk.Server(horizonUrl);
  }

  @Process(HORIZON_JOB_CHECK_TX)
  async handleCheckTx(job: Job<HorizonCheckTxPayload>): Promise<void> {
    const { transactionId, stellarTxHash } = job.data;

    if (!transactionId) {
      throw new Error('Missing transactionId in Horizon check-tx job');
    }

    // If we don't have a hash yet the tx hasn't been submitted — nothing to do.
    if (!stellarTxHash) {
      this.logger.debug(
        `Transaction ${transactionId} has no stellarTxHash yet; skipping.`,
      );
      return;
    }

    this.logger.log(
      `Checking Horizon for stellarTxHash=${stellarTxHash} (transactionId=${transactionId})`,
    );

    let horizonTx: any;
    try {
      horizonTx = await this.server
        .transactions()
        .transaction(stellarTxHash)
        .call();
    } catch (err: any) {
      // 404 means not yet confirmed — leave as PENDING and let Bull retry.
      if (err?.response?.status === 404) {
        this.logger.debug(
          `Transaction ${stellarTxHash} not yet found on Horizon; will retry.`,
        );
        throw err; // triggers Bull's configured back-off / retry
      }

      this.logger.error(
        `Horizon error for ${stellarTxHash}: ${err?.message ?? err}`,
      );
      throw err;
    }

    // Determine the new status based on the Horizon envelope result.
    const succeeded: boolean = horizonTx.successful === true;
    const newStatus = succeeded ? 'COMPLETED' : 'FAILED';

    const updated = await this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        // Only update records that are still PENDING / PROCESSING to avoid
        // overwriting a status that was already finalised through another path
        // (e.g. the contract-events processor).
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: newStatus,
        stellarTxHash: horizonTx.hash ?? stellarTxHash,
        statusUpdatedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      this.logger.log(
        `Transaction ${transactionId} → ${newStatus} (stellarTxHash=${stellarTxHash})`,
      );
    } else {
      this.logger.debug(
        `Transaction ${transactionId} was already finalised; no update needed.`,
      );
    }
  }
}
