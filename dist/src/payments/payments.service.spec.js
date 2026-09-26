"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const payments_service_1 = require("./payments.service");
const wallets_service_1 = require("../wallets/wallets.service");
/**
 * Scripted stand-in for WalletsService. The real CAS safety lives (and is
 * tested) in `wallets.service.spec.ts`; this fake lets the payments tests
 * focus on orchestration: leg ordering, idempotency, and compensation when a
 * leg fails after the other already committed.
 */
class FakeWalletsService {
    constructor() {
        this.balances = new Map();
        this.debitCalls = [];
        this.creditCalls = [];
        this.debitImpl = async (walletId, amount) => this.applyDelta(walletId, -amount);
        this.creditImpl = async (walletId, amount) => this.applyDelta(walletId, amount);
    }
    async debitBalance(walletId, amount) {
        this.debitCalls.push({ walletId, amount });
        return this.debitImpl(walletId, amount);
    }
    async creditBalance(walletId, amount) {
        this.creditCalls.push({ walletId, amount });
        return this.creditImpl(walletId, amount);
    }
    async getWallet(walletId) {
        const balance = this.balances.get(walletId);
        if (balance === undefined) {
            throw new Error(`Wallet with ID ${walletId} not found`);
        }
        return { id: walletId, balance };
    }
    applyDelta(walletId, signed) {
        const current = BigInt(this.balances.get(walletId) ?? '0');
        const next = current + signed;
        if (next < 0n) {
            throw new wallets_service_1.InsufficientBalanceError(walletId, current.toString(), -signed);
        }
        this.balances.set(walletId, next.toString());
        return {
            wallet: { id: walletId, balance: next.toString() },
            previousBalance: current.toString(),
            retries: 0,
        };
    }
}
(0, vitest_1.describe)('PaymentsService — issue #587 concurrency-safe payments', () => {
    let fakeWallets;
    let service;
    (0, vitest_1.beforeEach)(() => {
        fakeWallets = new FakeWalletsService();
        fakeWallets.balances.set('source', '1000');
        fakeWallets.balances.set('destination', '0');
        service = new payments_service_1.PaymentsService(fakeWallets);
    });
    (0, vitest_1.it)('processes a payment by debiting the source and crediting the destination', async () => {
        const result = await service.processPayment({
            sourceWalletId: 'source',
            destinationWalletId: 'destination',
            amountStroops: 250n,
        });
        (0, vitest_1.expect)(fakeWallets.balances.get('source')).toBe('750');
        (0, vitest_1.expect)(fakeWallets.balances.get('destination')).toBe('250');
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(result.amountStroops).toBe('250');
        (0, vitest_1.expect)(result.retries).toBe(0);
    });
    (0, vitest_1.it)('refuses self-payments and non-positive amounts before touching any wallet', async () => {
        await (0, vitest_1.expect)(service.processPayment({
            sourceWalletId: 'source',
            destinationWalletId: 'source',
            amountStroops: 10n,
        })).rejects.toThrow(/must differ/);
        await (0, vitest_1.expect)(service.processPayment({
            sourceWalletId: 'source',
            destinationWalletId: 'destination',
            amountStroops: 0n,
        })).rejects.toThrow(/must be positive/);
        (0, vitest_1.expect)(fakeWallets.debitCalls).toHaveLength(0);
        (0, vitest_1.expect)(fakeWallets.creditCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('rejects a duplicate idempotency key instead of paying twice', async () => {
        const request = {
            sourceWalletId: 'source',
            destinationWalletId: 'destination',
            amountStroops: 100n,
            idempotencyKey: 'key-1',
        };
        await service.processPayment(request);
        await (0, vitest_1.expect)(service.processPayment(request)).rejects.toThrow(/already processed/);
        (0, vitest_1.expect)(fakeWallets.debitCalls).toHaveLength(1);
        (0, vitest_1.expect)(fakeWallets.balances.get('destination')).toBe('100');
    });
    (0, vitest_1.it)('does not credit the destination when the debit leg fails', async () => {
        fakeWallets.debitImpl = async (walletId, amount) => {
            const current = BigInt(fakeWallets.balances.get(walletId) ?? '0');
            throw new wallets_service_1.InsufficientBalanceError(walletId, current.toString(), amount);
        };
        await (0, vitest_1.expect)(service.processPayment({
            sourceWalletId: 'source',
            destinationWalletId: 'destination',
            amountStroops: 5000n,
        })).rejects.toThrow(wallets_service_1.InsufficientBalanceError);
        (0, vitest_1.expect)(fakeWallets.creditCalls).toHaveLength(0);
        (0, vitest_1.expect)(fakeWallets.balances.get('source')).toBe('1000');
    });
    (0, vitest_1.it)('refunds the source when the credit leg fails so no funds are stranded', async () => {
        fakeWallets.creditImpl = async (walletId, amount) => {
            if (walletId === 'destination') {
                throw new wallets_service_1.BalanceUpdateConflictError(walletId, 4);
            }
            return fakeWallets.applyDelta(walletId, amount);
        };
        await (0, vitest_1.expect)(service.processPayment({
            sourceWalletId: 'source',
            destinationWalletId: 'destination',
            amountStroops: 250n,
        })).rejects.toThrow(wallets_service_1.BalanceUpdateConflictError);
        // Debit landed, destination credit failed, compensation credit restored
        // the source: conservation holds (1000 - 250 + 250 = 1000).
        (0, vitest_1.expect)(fakeWallets.balances.get('source')).toBe('1000');
        (0, vitest_1.expect)(fakeWallets.balances.get('destination')).toBe('0');
        (0, vitest_1.expect)(fakeWallets.creditCalls.map((c) => c.walletId)).toEqual([
            'destination',
            'source',
        ]);
    });
    (0, vitest_1.it)('records deposits through the concurrency-safe credit path', async () => {
        fakeWallets.balances.set('destination', '25');
        const result = await service.recordDeposit('destination', 50n);
        (0, vitest_1.expect)(fakeWallets.creditCalls).toEqual([
            { walletId: 'destination', amount: 50n },
        ]);
        (0, vitest_1.expect)(result).toEqual({
            walletId: 'destination',
            amountStroops: '50',
            balanceStroops: '75',
            retries: 0,
        });
    });
    (0, vitest_1.it)('rejects deposits into a missing wallet before any credit is attempted', async () => {
        await (0, vitest_1.expect)(service.recordDeposit('ghost', 10n)).rejects.toThrow(/not found/);
        (0, vitest_1.expect)(fakeWallets.creditCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('rejects non-positive deposits', async () => {
        await (0, vitest_1.expect)(service.recordDeposit('destination', 0n)).rejects.toThrow(/must be positive/);
        (0, vitest_1.expect)(fakeWallets.creditCalls).toHaveLength(0);
    });
    (0, vitest_1.it)('keeps balances conserved when 10 payments race through the service', async () => {
        // Every payment moves 10 stroops source -> destination concurrently. The
        // wallets layer's CAS guarantees each debit/credit lands exactly once, so
        // conservation must hold regardless of interleaving.
        const payments = 10;
        const amount = 10n;
        const results = await Promise.all(Array.from({ length: payments }, () => service.processPayment({
            sourceWalletId: 'source',
            destinationWalletId: 'destination',
            amountStroops: amount,
        })));
        (0, vitest_1.expect)(results).toHaveLength(payments);
        (0, vitest_1.expect)(fakeWallets.balances.get('source')).toBe((1000n - BigInt(payments) * amount).toString());
        (0, vitest_1.expect)(fakeWallets.balances.get('destination')).toBe((BigInt(payments) * amount).toString());
    });
});
