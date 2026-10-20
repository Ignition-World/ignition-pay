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
exports.WalletsService = exports.InsufficientBalanceError = exports.BalanceUpdateConflictError = exports.MAX_BALANCE_UPDATE_RETRIES = void 0;
exports.toSignedStroops = toSignedStroops;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const wallet_entity_1 = require("./entities/wallet.entity");
/**
 * Maximum number of times a compare-and-swap (CAS) balance update is retried
 * after losing a race against a concurrent writer (issue #587). Three retries
 * means at most four CAS attempts per delta, each starting from a fresh
 * balance read.
 */
exports.MAX_BALANCE_UPDATE_RETRIES = 3;
/** Error thrown when a CAS balance update exhausts its retries. */
class BalanceUpdateConflictError extends Error {
    constructor(walletId, attempts) {
        super(`Failed to update balance for wallet ${walletId} after ${attempts} ` +
            'attempts due to concurrent modifications');
        this.walletId = walletId;
        this.attempts = attempts;
        this.name = 'BalanceUpdateConflictError';
    }
}
exports.BalanceUpdateConflictError = BalanceUpdateConflictError;
/** Thrown when a debit cannot be satisfied by the current balance. */
class InsufficientBalanceError extends Error {
    constructor(walletId, currentBalance, requested) {
        super(`Insufficient funds in wallet ${walletId}: balance ${currentBalance} ` +
            `stroops is less than the requested ${requested} stroops`);
        this.walletId = walletId;
        this.currentBalance = currentBalance;
        this.requested = requested;
        this.name = 'InsufficientBalanceError';
    }
}
exports.InsufficientBalanceError = InsufficientBalanceError;
/**
 * Serializes a debit/credit delta into a signed stroop amount. Amounts are
 * stroop integers (1 XLM = 10_000_000 stroops) to keep arithmetic exact.
 */
function toSignedStroops(delta) {
    const raw = BigInt(delta.amount);
    if (raw < 0n) {
        throw new Error('Balance delta amount must be non-negative');
    }
    return delta.kind === 'credit' ? raw : -raw;
}
let WalletsService = class WalletsService {
    constructor(walletRepository) {
        this.walletRepository = walletRepository;
    }
    /**
     * Create (or idempotently return) the wallet holding `assetCode` for a user.
     */
    async getOrCreateWallet(userId, assetCode = 'XLM') {
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
        }
        catch (error) {
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
    async applyBalanceDelta(walletId, delta, options = {}) {
        const signed = toSignedStroops(delta);
        const maxRetries = options.maxRetries ?? exports.MAX_BALANCE_UPDATE_RETRIES;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            const outcome = options.manager
                ? await this.casUpdateInTransaction(options.manager, walletId, signed)
                : await this.walletRepository.manager.transaction(async (manager) => this.casUpdateInTransaction(manager, walletId, signed));
            if (outcome.kind === 'updated') {
                return {
                    wallet: await this.getWallet(walletId),
                    previousBalance: outcome.previousBalance,
                    retries: attempt,
                };
            }
            if (outcome.kind === 'missing') {
                throw new common_1.NotFoundException(`Wallet with ID ${walletId} not found`);
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
    creditBalance(walletId, amount, options = {}) {
        return this.applyBalanceDelta(walletId, { kind: 'credit', amount }, options);
    }
    /**
     * Debit a wallet balance (payment, withdrawal, etc.). Throws
     * {@link InsufficientBalanceError} when the wallet cannot cover the amount,
     * checked against a freshly read balance on every attempt, so a debit never
     * drives the balance negative even under concurrency.
     */
    debitBalance(walletId, amount, options = {}) {
        return this.applyBalanceDelta(walletId, { kind: 'debit', amount }, options);
    }
    async getWallet(walletId) {
        const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
        if (!wallet) {
            throw new common_1.NotFoundException(`Wallet with ID ${walletId} not found`);
        }
        return wallet;
    }
    /**
     * One compare-and-swap attempt, wrapped in its own transaction. Reads the
     * current balance, then writes the new balance only when it still equals
     * the value just read — the whole point of the CAS guard.
     */
    async casUpdateInTransaction(manager, walletId, signedStroops) {
        // Plain (non-locking) read: concurrency is resolved by the guarded
        // UPDATE below, not by holding a row lock across the attempt.
        const wallet = await manager.findOne(wallet_entity_1.Wallet, { where: { id: walletId } });
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
            .update(wallet_entity_1.Wallet)
            .set({ balance: nextBalance.toString() })
            .where('id = :id AND balance = :expectedBalance', { id: walletId, expectedBalance })
            .execute();
        if (result.affected !== 1) {
            // The guard missed: a concurrent writer changed the balance after our
            // read (or deleted the wallet). Let the caller re-read and retry.
            const current = await manager.findOne(wallet_entity_1.Wallet, { where: { id: walletId } });
            return current ? { kind: 'conflict' } : { kind: 'missing' };
        }
        return { kind: 'updated', previousBalance: expectedBalance };
    }
};
exports.WalletsService = WalletsService;
exports.WalletsService = WalletsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(wallet_entity_1.Wallet))
], WalletsService);
function isDuplicateKeyError(error) {
    const code = typeof error === 'object' && error !== null ? error.code : undefined;
    return code === '23505' || code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT';
}
