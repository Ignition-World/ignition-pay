import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';

/**
 * Maximum number of times a compare-and-swap (CAS) balance update is retried
 * after losing a race against a concurrent writer (issue #587). Three retries
 * means at most four CAS attempts per delta, each starting from a fresh
 * balance read.
 */
export const MAX_BALANCE_UPDATE_RETRIES = 3;

/** Error thrown when a CAS balance update exhausts its retries. */
export class BalanceUpdateConflictError extends Error {
  readonly name = 'BalanceUpdateConflictError';

  constructor(
    readonly walletId: string,
    readonly attempts: number,
  ) {
    super(
      `Failed to update balance for wallet ${walletId} after ${attempts} ` +
        'attempts due to concurrent modifications',
    );
  }
}

/** Thrown when a debit cannot be satisfied by the current balance. */
export class InsufficientBalanceError extends Error {
  readonly name = 'InsufficientBalanceError';

  constructor(
    readonly walletId: string,
    readonly currentBalance: string,
    readonly requested: bigint,
  ) {
    super(
      `Insufficient funds in wallet ${walletId}: balance ${currentBalance} ` +
        `stroops is less than the requested ${requested} stroops`,
    );
  }
}

export type BalanceDelta =
  | { kind: 'credit'; amount: string | number | bigint }
  | { kind: 'debit'; amount: string | number | bigint };

export interface ApplyBalanceDeltaResult {
  wallet: Wallet;
  /** Balance before this delta was applied (as of the winning CAS attempt). */
  previousBalance: string;
  /** Number of CAS retries that were needed before the update landed. */
  retries: number;
}

export interface BalanceUpdateOptions {
  /** Run every CAS attempt inside an existing transaction/manager. */
  manager?: EntityManager;
  /** Override the default retry budget (issue #587 requires max 3). */
  maxRetries?: number;
  /**
   * Optional pause (ms) before each retry, invoked with the upcoming attempt
   * number. Production callers should jitter this to desynchronize competing
   * writers; tests pass deterministic values.
   */
  backoffMs?: (upcomingAttempt: number) => number;
}

/**
 * Internal shape of a CAS attempt result. TypeORM reports `affected` rows for
 * an update, which distinguishes "guard matched" from "guard missed" without
 * exposing the row itself.
 */
type CasUpdateOutcome =
  | { kind: 'updated'; previousBalance: string }
  | { kind: 'conflict' }
  | { kind: 'missing' };

/**
 * Serializes a debit/credit delta into a signed stroop amount. Amounts are
 * stroop integers (1 XLM = 10_000_000 stroops) to keep arithmetic exact.
 */
export function toSignedStroops(delta: BalanceDelta): bigint {
  const raw = BigInt(delta.amount);
  if (raw < 0n) {
    throw new Error('Balance delta amount must be non-negative');
  }
  return delta.kind === 'credit' ? raw : -raw;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
  ) {}

  /**
   * Create (or idempotently return) the wallet holding `assetCode` for a user.
   */
  async getOrCreateWallet(userId: string, assetCode = 'XLM'): Promise<Wallet> {
    const existing = await this.walletRepository.findOne({
      where: { userId, assetCode },
    });
    if (existing) {
      return existing;
    }

    const wallet = this.walletRepository.create({
      userId,
      assetCode,
      balance: '0',
    });
    try {
      return await this.walletRepository.save(wallet);
    } catch (error) {
      // Unique-key race with a concurrent create: re-read instead of failing.
      if (isDuplicateKeyError(error)) {
        const raced = await this.walletRepository.findOne({
          where: { userId, assetCode },
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  /**
   * Apply a credit/debit to a wallet balance using an optimistic
   * compare-and-swap (CAS) loop — issue #587.
   *
   * Every attempt runs inside its own transaction and performs:
   *   1. a fresh read of the wallet's current balance,
   *   2. a guarded write equivalent to
   *      `UPDATE wallets SET balance = :next WHERE id = :id AND balance = :expected`
   *      (the database-level `UPDATE ... WHERE balance = expected` pattern
   *      from the acceptance criteria), and
   *   3. a commit that only lands if exactly one row matched the guard.
   *
   * When the guard misses — another processor changed the balance between the
   * read and the write — the attempt is retried with a fresh balance read, up
   * to `MAX_BALANCE_UPDATE_RETRIES` retries.
   *
   * Invariant: under any interleaving, the final balance equals the initial
   * balance plus the sum of all applied deltas. An update either lands on the
   * exact balance it read or does not happen at all, so no delta is ever
   * silently lost.
   */
  async applyBalanceDelta(
    walletId: string,
    delta: BalanceDelta,
    options: BalanceUpdateOptions = {},
  ): Promise<ApplyBalanceDeltaResult> {
    const signed = toSignedStroops(delta);
    const maxRetries = options.maxRetries ?? MAX_BALANCE_UPDATE_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const outcome = options.manager
        ? await this.casUpdateInTransaction(options.manager, walletId, signed)
        : await this.walletRepository.manager.transaction(
            async (manager: EntityManager) =>
              this.casUpdateInTransaction(manager, walletId, signed),
          );

      if (outcome.kind === 'updated') {
        return {
          wallet: await this.getWallet(walletId),
          previousBalance: outcome.previousBalance,
          retries: attempt,
        };
      }

      if (outcome.kind === 'missing') {
        throw new NotFoundException(`Wallet with ID ${walletId} not found`);
      }

      // kind === 'conflict': another writer changed the balance between the
      // read and the guarded write. Loop and retry with a fresh balance
      // read, pausing for the caller's backoff (if any) first.
      const backoff = options.backoffMs?.(attempt + 1) ?? 0;
      if (backoff > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw new BalanceUpdateConflictError(walletId, maxRetries + 1);
  }

  /**
   * Credit a wallet balance (deposit, refund, etc.).
   */
  creditBalance(
    walletId: string,
    amount: string | number | bigint,
    options: BalanceUpdateOptions = {},
  ): Promise<ApplyBalanceDeltaResult> {
    return this.applyBalanceDelta(walletId, { kind: 'credit', amount }, options);
  }

  /**
   * Debit a wallet balance (payment, withdrawal, etc.). Throws
   * {@link InsufficientBalanceError} when the wallet cannot cover the amount,
   * checked against a freshly read balance on every attempt, so a debit never
   * drives the balance negative even under concurrency.
   */
  debitBalance(
    walletId: string,
    amount: string | number | bigint,
    options: BalanceUpdateOptions = {},
  ): Promise<ApplyBalanceDeltaResult> {
    return this.applyBalanceDelta(walletId, { kind: 'debit', amount }, options);
  }

  async getWallet(walletId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${walletId} not found`);
    }
    return wallet;
  }

  /**
   * One compare-and-swap attempt, wrapped in its own transaction. Reads the
   * current balance, then writes the new balance only when it still equals
   * the value just read — the whole point of the CAS guard.
   */
  private async casUpdateInTransaction(
    manager: EntityManager,
    walletId: string,
    signedStroops: bigint,
  ): Promise<CasUpdateOutcome> {
    // Plain (non-locking) read: concurrency is resolved by the guarded
    // UPDATE below, not by holding a row lock across the attempt.
    const wallet = await manager.findOne(Wallet, { where: { id: walletId } });

    if (!wallet) {
      return { kind: 'missing' };
    }

    const expectedBalance = wallet.balance;
    const nextBalance = BigInt(expectedBalance) + signedStroops;

    if (nextBalance < 0n) {
      // The balance was read fresh and this transaction has written nothing,
      // so this is a definitive insufficient-funds result, not a race —
      // retrying cannot help.
      throw new InsufficientBalanceError(walletId, expectedBalance, BigInt(-signedStroops));
    }

    const result = await manager
      .createQueryBuilder()
      .update(Wallet)
      .set({ balance: nextBalance.toString() })
      .where('id = :id AND balance = :expectedBalance', { id: walletId, expectedBalance })
      .execute();

    if (result.affected !== 1) {
      // The guard missed: a concurrent writer changed the balance after our
      // read (or deleted the wallet). Let the caller re-read and retry.
      const current = await manager.findOne(Wallet, { where: { id: walletId } });
      return current ? { kind: 'conflict' } : { kind: 'missing' };
    }

    return { kind: 'updated', previousBalance: expectedBalance };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return code === '23505' || code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT';
}
