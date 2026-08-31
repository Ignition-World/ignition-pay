import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import BigNumber from 'bignumber.js';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QUEUE_PAYMENTS } from '../queue/queue.constants';
import { PAYMENT_JOB_PROCESS, PaymentJobPayload } from '../queue/queue.jobs';

export interface EstimatedFee {
  feeAmount: string;
  feeAssetCode: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_PAYMENTS)
    private readonly paymentQueue: Queue<PaymentJobPayload>,
  ) {}

  async initiatePayment(
    walletIdOrDto: string | CreatePaymentDto,
    dtoParam?: CreatePaymentDto,
  ) {
    const dto =
      typeof walletIdOrDto === 'string'
        ? { ...dtoParam!, senderWalletId: walletIdOrDto }
        : walletIdOrDto;

    const effectiveKey =
      dto.idempotencyKey ??
      `${dto.senderWalletId}:${dto.recipientAddress}:${dto.amount}:${dto.assetCode}`;

    // ── 1. Validate sender wallet ────────────────────────────────────────────
    const senderWallet = await this.prisma.wallet.findUnique({
      where: { id: dto.senderWalletId },
    });

    if (!senderWallet || !senderWallet.isActive) {
      throw new NotFoundException(
        `Sender wallet ${dto.senderWalletId} not found or inactive`,
      );
    }

    if (senderWallet.status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Outgoing transactions are not allowed: wallet is suspended',
      );
    }

    if (senderWallet.status === 'CLOSED') {
      throw new ForbiddenException(
        'Outgoing transactions are not allowed: wallet is closed',
      );
    }

    // ── 2. Enforce rolling transfer limits ───────────────────────────────────
    await this.validateTransactionLimits(senderWallet, dto.amount);

    // ── 3. Persist Transaction record (status: PENDING) ─────────────────────
    const recipientWallet = await this.prisma.wallet.findUnique({
      where: { depositAddress: dto.recipientAddress },
    });

    const transaction = await this.prisma.transaction.create({
      data: {
        fromWalletId: dto.senderWalletId,
        toWalletId: recipientWallet?.id ?? dto.senderWalletId,
        amount: dto.amount,
        assetCode: dto.assetCode,
        status: 'PENDING',
        metadata: {
          ...(recipientWallet
            ? {}
            : { externalRecipientAddress: dto.recipientAddress }),
          idempotencyKey: effectiveKey,
        },
      },
    });

    // ── 4. Enqueue processing job ────────────────────────────────────────────
    await this.paymentQueue.add(PAYMENT_JOB_PROCESS, {
      transactionId: transaction.id,
      senderWalletId: dto.senderWalletId,
      recipientAddress: dto.recipientAddress,
      amount: dto.amount,
      assetCode: dto.assetCode,
    } satisfies PaymentJobPayload);

    this.logger.log(
      `Payment queued: txn=${transaction.id} from=${dto.senderWalletId} ` +
        `to=${dto.recipientAddress} amount=${dto.amount} ${dto.assetCode}`,
    );

    return {
      id: transaction.id,
      status: 'queued',
      senderWalletId: dto.senderWalletId,
      recipientAddress: dto.recipientAddress,
      amount: dto.amount,
      assetCode: dto.assetCode,
      createdAt: transaction.createdAt.toISOString(),
    };
  }


  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Enforces rolling 24-hour and 30-day outgoing transfer limits for a wallet.
   * Uses Prisma aggregation over transactions with PENDING or COMPLETED status.
   */
  private async validateTransactionLimits(
    wallet: { id: string; dailyLimit: unknown; monthlyLimit: unknown },
    outgoingAmountStr: string,
  ): Promise<void> {
    const outgoing = new BigNumber(outgoingAmountStr);
    if (outgoing.isLessThanOrEqualTo(0)) return;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const sumOutgoing = async (since: Date): Promise<BigNumber> => {
      const result = await this.prisma.transaction.aggregate({
        where: {
          fromWalletId: wallet.id,
          status: { in: ['PENDING', 'COMPLETED'] },
          createdAt: { gte: since },
        },
        _sum: { amount: true },
      });
      return new BigNumber(result._sum.amount?.toString() ?? '0');
    };

    // Rolling 24-hour limit
    if (wallet.dailyLimit != null) {
      const dailyLimit = new BigNumber(wallet.dailyLimit as string);
      const dailySpent = await sumOutgoing(oneDayAgo);
      if (dailySpent.plus(outgoing).isGreaterThan(dailyLimit)) {
        const remaining = BigNumber.max(0, dailyLimit.minus(dailySpent));
        this.logger.warn(
          `Wallet ${wallet.id} exceeded daily limit — ` +
            `limit=${dailyLimit.toFixed(7)} spent=${dailySpent.toFixed(7)} attempted=${outgoing.toFixed(7)}`,
        );
        throw new UnprocessableEntityException(
          `Transaction exceeds 24-hour rolling daily limit of ${dailyLimit.toFixed(2)}. ` +
            `Remaining: ${remaining.toFixed(2)}.`,
        );
      }
    }

    // Rolling 30-day limit
    if (wallet.monthlyLimit != null) {
      const monthlyLimit = new BigNumber(wallet.monthlyLimit as string);
      const monthlySpent = await sumOutgoing(thirtyDaysAgo);
      if (monthlySpent.plus(outgoing).isGreaterThan(monthlyLimit)) {
        const remaining = BigNumber.max(0, monthlyLimit.minus(monthlySpent));
        this.logger.warn(
          `Wallet ${wallet.id} exceeded monthly limit — ` +
            `limit=${monthlyLimit.toFixed(7)} spent=${monthlySpent.toFixed(7)} attempted=${outgoing.toFixed(7)}`,
        );
        throw new UnprocessableEntityException(
          `Transaction exceeds 30-day rolling monthly limit of ${monthlyLimit.toFixed(2)}. ` +
            `Remaining: ${remaining.toFixed(2)}.`,
        );
      }
    }
  }
}
