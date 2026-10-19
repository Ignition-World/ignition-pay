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
import { DashboardCacheService } from '../users/dashboard-cache.service';

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
    private readonly dashboardCache: DashboardCacheService,
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

    const stellarMemo = dto.memo
      ? this.buildStellarMemo(dto.memo, dto.memoType)
      : null;

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
          ...(stellarMemo
            ? { memo: stellarMemo.value, memoType: stellarMemo.type }
            : {}),
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
      ...(stellarMemo
        ? { memo: stellarMemo.value, memoType: stellarMemo.type }
        : {}),
    } satisfies PaymentJobPayload);

    this.logger.log(
      `Payment queued: txn=${transaction.id} from=${dto.senderWalletId} ` +
        `to=${dto.recipientAddress} amount=${dto.amount} ${dto.assetCode}` +
        (stellarMemo ? ` memo=${stellarMemo.value}` : ''),
    );

    // Issue #591 — a new transaction is a significant event: invalidate the
    // warmed dashboard cache for both parties so the next load recomputes.
    await this.invalidateDashboardCaches([
      senderWallet.userId,
      recipientWallet?.userId,
    ]);

    return {
      id: transaction.id,
      status: 'queued',
      senderWalletId: dto.senderWalletId,
      recipientAddress: dto.recipientAddress,
      amount: dto.amount,
      assetCode: dto.assetCode,
      ...(stellarMemo
        ? { memo: stellarMemo.value, memoType: stellarMemo.type }
        : {}),
      createdAt: transaction.createdAt.toISOString(),
    };
  }

  /**
   * Safely formats and clamps a Stellar memo to the protocol limits (Issue #808).
   * Stellar protocol limits MEMO_TEXT to at most 28 UTF-8 bytes.
   * If a non-ASCII input (e.g. accented characters, UTF-8 symbols, emojis) or base64 of a hash
   * is within 28 characters, it could expand beyond 28 bytes in UTF-8, producing op_malformed on submit.
   * This method ensures text memos are truncated by UTF-8 byte length (not character length).
   */
  buildStellarMemo(
    memo?: string,
    memoType: string = 'text',
  ): { type: string; value: string } | null {
    if (!memo) return null;

    const normalizedType = memoType.toLowerCase();

    if (normalizedType === 'hash' || normalizedType === 'return') {
      const trimmed = memo.trim();
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return { type: normalizedType, value: trimmed.toLowerCase() };
      }
      // Check if it's base64 of a 32-byte hash (44 chars)
      try {
        const buf = Buffer.from(trimmed, 'base64');
        if (buf.length === 32) {
          return { type: normalizedType, value: buf.toString('hex').toLowerCase() };
        }
      } catch {
        // Fall back to text if base64 decode fails
      }
    }

    if (normalizedType === 'id') {
      const numeric = memo.replace(/\D/g, '');
      return { type: 'id', value: numeric || '0' };
    }

    // Default to 'text' memo: must strictly not exceed 28 UTF-8 bytes
    return { type: 'text', value: this.truncateTo28Utf8Bytes(memo) };
  }

  /**
   * Truncate string to at most 28 UTF-8 bytes without breaking UTF-8 characters
   * or leaving unpaired surrogate characters.
   */
  truncateTo28Utf8Bytes(input: string): string {
    if (!input || typeof input !== 'string') return '';
    let result = input;
    while (Buffer.byteLength(result, 'utf8') > 28) {
      result = result.slice(0, -1);
    }
    // Remove trailing unpaired surrogate if split mid-codepoint
    if (result.length > 0 && /[\uD800-\uDBFF]$/.test(result)) {
      result = result.slice(0, -1);
    }
    return result;
  }


  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Issue #591 — invalidate the warmed dashboard cache for the given users.
   * Failures are swallowed so a cache problem never blocks a payment.
   */
  private async invalidateDashboardCaches(
    userIds: Array<string | null | undefined>,
  ): Promise<void> {
    const unique = [...new Set(userIds.filter((id): id is string => !!id))];
    await Promise.all(
      unique.map((userId) =>
        this.dashboardCache.invalidate(userId).catch((err: any) => {
          this.logger.warn(
            `Failed to invalidate dashboard cache for user ${userId}: ${err?.message ?? err}`,
          );
        }),
      ),
    );
  }

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
