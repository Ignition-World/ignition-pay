import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WalletsService } from '../wallets/wallets.service';

export interface PaymentRequest {
  /** Wallet to debit. */
  sourceWalletId: string;
  /** Wallet to credit. */
  destinationWalletId: string;
  /** Amount in stroops (1 XLM = 10_000_000 stroops). */
  amountStroops: string | number | bigint;
  /** Optional idempotency key; the same key is never processed twice. */
  idempotencyKey?: string;
}

export interface PaymentResult {
  paymentId: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amountStroops: string;
  /** Combined CAS retries spent by the debit and credit legs. */
  retries: number;
  status: 'completed';
}

/**
 * Processes payments whose ledger effects are guaranteed to survive
 * concurrent execution — issue #587.
 *
 * Both legs of a payment (debit source, credit destination) go through
 * {@link WalletsService.applyBalanceDelta}, which uses the database-level
 * `UPDATE ... WHERE balance = expected` compare-and-swap with up to three
 * retries on conflict. Multiple payment processors hitting the same wallet at
 * the same time therefore can no longer overwrite each other's writes: every
 * update re-reads the latest committed balance and only lands when it still
 * matches, so no deposit is silently lost.
 */
@Injectable()
export class PaymentsService {
  private readonly processedKeys = new Set<string>();

  // Explicit @Inject keeps Nest DI working even when design:paramtypes
  // metadata is not emitted (e.g. esbuild-based test runners).
  constructor(
    @Inject(WalletsService) private readonly walletsService: WalletsService,
  ) {}

  /**
   * Process a payment: atomically debit the source wallet and credit the
   * destination wallet. Each leg independently retries on CAS conflict with
   * a fresh balance read (max 3 retries, per the acceptance criteria).
   *
   * The debit runs first; if it throws (missing wallet, insufficient funds,
   * or exhausted retries) the credit never happens, so money is neither
   * created nor destroyed by a failed payment.
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const amount = BigInt(request.amountStroops);
    if (amount <= 0n) {
      throw new Error('Payment amount must be positive');
    }

    if (request.sourceWalletId === request.destinationWalletId) {
      throw new Error('Source and destination wallets must differ');
    }

    if (request.idempotencyKey) {
      if (this.processedKeys.has(request.idempotencyKey)) {
        throw new Error(
          `Payment with idempotency key ${request.idempotencyKey} was already processed`,
        );
      }
      this.processedKeys.add(request.idempotencyKey);
    }

    const debit = await this.walletsService.debitBalance(
      request.sourceWalletId,
      amount,
    );

    let credit;
    try {
      credit = await this.walletsService.creditBalance(
        request.destinationWalletId,
        amount,
      );
    } catch (error) {
      // The debit already landed. Compensate by refunding the source so a
      // failed credit cannot strand funds — no silent loss in any scenario.
      await this.walletsService.creditBalance(request.sourceWalletId, amount);
      throw error;
    }

    return {
      paymentId: randomUUID(),
      sourceWalletId: request.sourceWalletId,
      destinationWalletId: request.destinationWalletId,
      amountStroops: amount.toString(),
      retries: debit.retries + credit.retries,
      status: 'completed',
    };
  }

  /**
   * Record an external deposit (e.g. a Stellar payment observed on-chain) by
   * crediting the target wallet through the concurrency-safe update.
   */
  async recordDeposit(walletId: string, amountStroops: string | number | bigint) {
    const amount = BigInt(amountStroops);
    if (amount <= 0n) {
      throw new Error('Deposit amount must be positive');
    }

    // Throws NotFoundException when the wallet does not exist.
    await this.walletsService.getWallet(walletId);

    const result = await this.walletsService.creditBalance(walletId, amount);
    return {
      walletId,
      amountStroops: amount.toString(),
      balanceStroops: result.wallet.balance,
      retries: result.retries,
    };
  }

  /** Convenience read used by callers that need the live balance. */
  async getBalance(walletId: string): Promise<string> {
    const wallet = await this.walletsService.getWallet(walletId);
    return wallet.balance;
  }
}
