import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Horizon } from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';
import { ReconciliationStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { QUEUE_EMAIL } from '../queue/queue.constants';
import { EMAIL_JOB_SEND_NOTIFICATION } from '../queue/queue.jobs';

interface Wallet {
  id: string;
  stellarAddress: string;
  balance: string;
  isActive: boolean;
}

@Injectable()
export class BalanceReconciliationService {
  private readonly logger = new Logger(BalanceReconciliationService.name);
  private readonly horizonServer: Horizon.Server;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
  ) {
    const horizonUrl =
      process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    this.horizonServer = new Horizon.Server(horizonUrl);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async reconcileWalletBalances(): Promise<void> {
    this.logger.log('Starting automated wallet balance reconciliation job...');

    const wallets = await this.prisma.wallet.findMany({
      where: { isActive: true },
      select: {
        id: true,
        depositAddress: true,
        balance: true,
        isActive: true,
      },
    });

    let flaggedCount = 0;

    for (const wallet of wallets) {
      try {
        const isDiscrepant = await this.reconcileWallet({
          id: wallet.id,
          stellarAddress: wallet.depositAddress,
          balance: wallet.balance.toString(),
          isActive: wallet.isActive,
        });
        if (isDiscrepant) {
          flaggedCount++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to reconcile wallet ${wallet.id} (${wallet.depositAddress}):`,
          error.stack,
        );
      }
    }

    this.logger.log(
      `Reconciliation job finished. Scanned: ${wallets.length}, Flagged Discrepancies: ${flaggedCount}`,
    );
  }

  async reconcileWallet(wallet: Wallet): Promise<boolean> {
    const accountData = await this.horizonServer
      .loadAccount(wallet.stellarAddress)
      .catch((err) => {
        if (err?.response?.status === 404) {
          return null;
        }
        throw err;
      });

    const nativeAsset = accountData?.balances.find(
      (b) => b.asset_type === 'native',
    );
    const onChainBalance = new BigNumber(
      nativeAsset ? nativeAsset.balance : '0.0000000',
    );
    const dbBalance = new BigNumber(wallet.balance.toString());

    const driftAmount = dbBalance.minus(onChainBalance).abs();
    const DRIFT_THRESHOLD = new BigNumber('0.00001');

    // configure alert recipients from environment (comma-separated)
    const rawRecipients = process.env.RECONCILIATION_ALERT_EMAIL || '';
    const alertRecipients = rawRecipients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (driftAmount.isGreaterThan(DRIFT_THRESHOLD)) {
      this.logger.warn(
        `Balance drift detected for Wallet ${wallet.id}! DB: ${dbBalance.toFixed(7)}, On-Chain: ${onChainBalance.toFixed(7)}`,
      );

      // Prepare alert metadata to persist in the discrepancy notes column
      const alertTimestamp = new Date().toISOString();
      const alertMeta = alertRecipients.length
        ? `Alert queued to ${alertRecipients.join(', ')} at ${alertTimestamp}`
        : `No alert recipients configured (checked at ${alertTimestamp})`;

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.balanceDiscrepancy.findFirst({
          where: {
            walletId: wallet.id,
            status: ReconciliationStatus.PENDING,
          },
        });

        if (existing) {
          await tx.balanceDiscrepancy.update({
            where: { id: existing.id },
            data: {
              dbBalance: dbBalance.toFixed(7),
              onChainBalance: onChainBalance.toFixed(7),
              driftAmount: driftAmount.toFixed(7),
              notes: existing.notes
                ? `${existing.notes}\n${alertMeta}`
                : alertMeta,
            },
          });
        } else {
          await tx.balanceDiscrepancy.create({
            data: {
              walletId: wallet.id,
              stellarAddress: wallet.stellarAddress,
              dbBalance: dbBalance.toFixed(7),
              onChainBalance: onChainBalance.toFixed(7),
              driftAmount: driftAmount.toFixed(7),
              status: ReconciliationStatus.PENDING,
              notes: alertMeta,
            },
          });
        }
      });

      // Enqueue non-blocking notification emails to configured recipients
      if (alertRecipients.length > 0) {
        const subject = `Balance drift detected for wallet ${wallet.id}`;
        const body = `A balance discrepancy was detected for wallet ${wallet.id} (address ${wallet.stellarAddress}).\n\nDB balance: ${dbBalance.toFixed(7)}\nOn-chain balance: ${onChainBalance.toFixed(7)}\nDrift: ${driftAmount.toFixed(7)}\n\nPlease investigate.`;

        for (const to of alertRecipients) {
          this.emailQueue
            .add(EMAIL_JOB_SEND_NOTIFICATION, {
              to,
              subject,
              body,
            })
            .catch((err: unknown) => {
              this.logger.error(
                `Failed to enqueue reconciliation alert to ${to} for wallet ${wallet.id}`,
                err instanceof Error ? err.stack : String(err),
              );
            });
        }
      } else {
        this.logger.warn(
          `Reconciliation drift detected but no alert recipients configured. Set RECONCILIATION_ALERT_EMAIL to enable notifications. Wallet ${wallet.id}`,
        );
      }

      return true;
    }

    return false;
  }
}
