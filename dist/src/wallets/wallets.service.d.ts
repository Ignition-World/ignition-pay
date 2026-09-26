import { EntityManager, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
/**
 * Maximum number of times a compare-and-swap (CAS) balance update is retried
 * after losing a race against a concurrent writer (issue #587). Three retries
 * means at most four CAS attempts per delta, each starting from a fresh
 * balance read.
 */
export declare const MAX_BALANCE_UPDATE_RETRIES = 3;
/** Error thrown when a CAS balance update exhausts its retries. */
export declare class BalanceUpdateConflictError extends Error {
    readonly walletId: string;
    readonly attempts: number;
    readonly name = "BalanceUpdateConflictError";
    constructor(walletId: string, attempts: number);
}
/** Thrown when a debit cannot be satisfied by the current balance. */
export declare class InsufficientBalanceError extends Error {
    readonly walletId: string;
    readonly currentBalance: string;
    readonly requested: bigint;
    readonly name = "InsufficientBalanceError";
    constructor(walletId: string, currentBalance: string, requested: bigint);
}
export type BalanceDelta = {
    kind: 'credit';
    amount: string | number | bigint;
} | {
    kind: 'debit';
    amount: string | number | bigint;
};
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
 * Serializes a debit/credit delta into a signed stroop amount. Amounts are
 * stroop integers (1 XLM = 10_000_000 stroops) to keep arithmetic exact.
 */
export declare function toSignedStroops(delta: BalanceDelta): bigint;
export declare class WalletsService {
    private readonly walletRepository;
    constructor(walletRepository: Repository<Wallet>);
    /**
     * Create (or idempotently return) the wallet holding `assetCode` for a user.
     */
    getOrCreateWallet(userId: string, assetCode?: string): Promise<Wallet>;
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
    applyBalanceDelta(walletId: string, delta: BalanceDelta, options?: BalanceUpdateOptions): Promise<ApplyBalanceDeltaResult>;
    /**
     * Credit a wallet balance (deposit, refund, etc.).
     */
    creditBalance(walletId: string, amount: string | number | bigint, options?: BalanceUpdateOptions): Promise<ApplyBalanceDeltaResult>;
    /**
     * Debit a wallet balance (payment, withdrawal, etc.). Throws
     * {@link InsufficientBalanceError} when the wallet cannot cover the amount,
     * checked against a freshly read balance on every attempt, so a debit never
     * drives the balance negative even under concurrency.
     */
    debitBalance(walletId: string, amount: string | number | bigint, options?: BalanceUpdateOptions): Promise<ApplyBalanceDeltaResult>;
    getWallet(walletId: string): Promise<Wallet>;
    /**
     * One compare-and-swap attempt, wrapped in its own transaction. Reads the
     * current balance, then writes the new balance only when it still equals
     * the value just read — the whole point of the CAS guard.
     */
    private casUpdateInTransaction;
}
