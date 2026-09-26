import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TransactionStatus, type Wallet } from '@prisma/client';
import BigNumber from 'bignumber.js';
import { PrismaService } from '../../prisma/prisma.service';

export const DEFAULT_WALLET_LIMITS = {
  dailyLimit: 1000,
  monthlyLimit: 10000,
} as const;

type WalletLimitInput = {
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
};

@Injectable()
export class WalletLimitService {
  private readonly logger = new Logger(WalletLimitService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves wallet creation limits from request input plus platform defaults.
   */
  resolveCreationLimits(input: WalletLimitInput = {}) {
    return {
      dailyLimit: input.dailyLimit ?? DEFAULT_WALLET_LIMITS.dailyLimit,
      monthlyLimit: input.monthlyLimit ?? DEFAULT_WALLET_LIMITS.monthlyLimit,
    };
  }

  /**
   * Enforces rolling 24-hour and 30-day outgoing transfer limits for a wallet.
   */
  async validateTransactionLimits(
    wallet: Pick<Wallet, 'id' | 'dailyLimit' | 'monthlyLimit'>,
    outgoingAmountStr: string,
  ): Promise<void> {
    const outgoingAmount = new BigNumber(outgoingAmountStr);

    if (outgoingAmount.isLessThanOrEqualTo(0)) {
      return;
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (wallet.dailyLimit != null) {
      const dailyLimit = new BigNumber(wallet.dailyLimit.toString());
      const dailySpent = await this.getSumOfOutgoingTransactions(
        wallet.id,
        twentyFourHoursAgo,
        now,
      );
      const projectedDailyTotal = dailySpent.plus(outgoingAmount);

      if (projectedDailyTotal.isGreaterThan(dailyLimit)) {
        this.logger.warn(
          `Wallet ${wallet.id} exceeded daily limit. Limit: ${dailyLimit.toFixed(7)}, Rolling 24h Spent: ${dailySpent.toFixed(7)}, Attempted: ${outgoingAmount.toFixed(7)}`,
        );

        throw new UnprocessableEntityException(
          `Transaction exceeds 24-hour rolling daily limit of ${dailyLimit.toFixed(2)} XLM. Remaining: ${BigNumber.max(0, dailyLimit.minus(dailySpent)).toFixed(2)} XLM.`,
        );
      }
    }

    if (wallet.monthlyLimit != null) {
      const monthlyLimit = new BigNumber(wallet.monthlyLimit.toString());
      const monthlySpent = await this.getSumOfOutgoingTransactions(
        wallet.id,
        thirtyDaysAgo,
        now,
      );
      const projectedMonthlyTotal = monthlySpent.plus(outgoingAmount);

      if (projectedMonthlyTotal.isGreaterThan(monthlyLimit)) {
        this.logger.warn(
          `Wallet ${wallet.id} exceeded monthly limit. Limit: ${monthlyLimit.toFixed(7)}, Rolling 30d Spent: ${monthlySpent.toFixed(7)}, Attempted: ${outgoingAmount.toFixed(7)}`,
        );

        throw new UnprocessableEntityException(
          `Transaction exceeds 30-day rolling monthly limit of ${monthlyLimit.toFixed(2)} XLM. Remaining: ${BigNumber.max(0, monthlyLimit.minus(monthlySpent)).toFixed(2)} XLM.`,
        );
      }
    }
  }

  private async getSumOfOutgoingTransactions(
    walletId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<BigNumber> {
    const result = await this.prisma.transaction.aggregate({
      where: {
        fromWalletId: walletId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
        status: {
          in: [TransactionStatus.COMPLETED, TransactionStatus.PENDING],
        },
      },
      _sum: {
        amount: true,
      },
    });

    return new BigNumber(result._sum.amount?.toString() ?? '0');
  }
}
