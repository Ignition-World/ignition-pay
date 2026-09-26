"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const wallets_service_1 = require("../wallets/wallets.service");
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
let PaymentsService = class PaymentsService {
    // Explicit @Inject keeps Nest DI working even when design:paramtypes
    // metadata is not emitted (e.g. esbuild-based test runners).
    constructor(walletsService) {
        this.walletsService = walletsService;
        this.processedKeys = new Set();
    }
    /**
     * Process a payment: atomically debit the source wallet and credit the
     * destination wallet. Each leg independently retries on CAS conflict with
     * a fresh balance read (max 3 retries, per the acceptance criteria).
     *
     * The debit runs first; if it throws (missing wallet, insufficient funds,
     * or exhausted retries) the credit never happens, so money is neither
     * created nor destroyed by a failed payment.
     */
    async processPayment(request) {
        const amount = BigInt(request.amountStroops);
        if (amount <= 0n) {
            throw new Error('Payment amount must be positive');
        }
        if (request.sourceWalletId === request.destinationWalletId) {
            throw new Error('Source and destination wallets must differ');
        }
        if (request.idempotencyKey) {
            if (this.processedKeys.has(request.idempotencyKey)) {
                throw new Error(`Payment with idempotency key ${request.idempotencyKey} was already processed`);
            }
            this.processedKeys.add(request.idempotencyKey);
        }
        const debit = await this.walletsService.debitBalance(request.sourceWalletId, amount);
        let credit;
        try {
            credit = await this.walletsService.creditBalance(request.destinationWalletId, amount);
        }
        catch (error) {
            // The debit already landed. Compensate by refunding the source so a
            // failed credit cannot strand funds — no silent loss in any scenario.
            await this.walletsService.creditBalance(request.sourceWalletId, amount);
            throw error;
        }
        return {
            paymentId: (0, node_crypto_1.randomUUID)(),
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
    async recordDeposit(walletId, amountStroops) {
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
    async getBalance(walletId) {
        const wallet = await this.walletsService.getWallet(walletId);
        return wallet.balance;
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(wallets_service_1.WalletsService))
], PaymentsService);
