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
export declare class PaymentsService {
    private readonly walletsService;
    private readonly processedKeys;
    constructor(walletsService: WalletsService);
    /**
     * Process a payment: atomically debit the source wallet and credit the
     * destination wallet. Each leg independently retries on CAS conflict with
     * a fresh balance read (max 3 retries, per the acceptance criteria).
     *
     * The debit runs first; if it throws (missing wallet, insufficient funds,
     * or exhausted retries) the credit never happens, so money is neither
     * created nor destroyed by a failed payment.
     */
    processPayment(request: PaymentRequest): Promise<PaymentResult>;
    /**
     * Record an external deposit (e.g. a Stellar payment observed on-chain) by
     * crediting the target wallet through the concurrency-safe update.
     */
    recordDeposit(walletId: string, amountStroops: string | number | bigint): Promise<{
        walletId: string;
        amountStroops: string;
        balanceStroops: string;
        retries: number;
    }>;
    /** Convenience read used by callers that need the live balance. */
    getBalance(walletId: string): Promise<string>;
}
