"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const vitest_1 = require("vitest");
const wallets_service_1 = require("./wallets.service");
const wallet_entity_1 = require("./entities/wallet.entity");
/**
 * In-memory wallet "database" reproducing the lost-update race from issue
 * #587: reads are immediate, but every guarded write can be held at the
 * `UPDATE ... WHERE balance = expected` gate so concurrent attempts genuinely
 * read the same balance and race to commit — exactly like simultaneous
 * deposits hitting a real database.
 */
class FakeWalletDb {
    constructor() {
        this.rows = new Map();
    }
    createWallet(overrides = {}) {
        const wallet = new wallet_entity_1.Wallet();
        Object.assign(wallet, {
            id: overrides.id ?? crypto.randomUUID(),
            userId: overrides.userId ?? 'user-1',
            assetCode: overrides.assetCode ?? 'XLM',
            balance: overrides.balance ?? '0',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        this.rows.set(wallet.id, wallet);
        return wallet;
    }
    findOne(id) {
        return this.rows.get(id);
    }
    /**
     * Guarded CAS write mirroring
     * `UPDATE wallets SET balance = :next WHERE id = :id AND balance = :expected`.
     * Returns the number of affected rows (0 when the guard missed).
     */
    casUpdate(id, expectedBalance, nextBalance) {
        const wallet = this.rows.get(id);
        if (!wallet || wallet.balance !== expectedBalance) {
            return 0;
        }
        wallet.balance = nextBalance;
        return 1;
    }
}
(0, vitest_1.describe)('WalletsService — issue #587 race condition fix', () => {
    let service;
    let db;
    let queuedWrites;
    let gateClosed;
    let gateOpen;
    let openGate;
    /** When true, a concurrent writer always steals the row before our write. */
    let adversaryActive;
    let executeCalls;
    function applyWrite(write) {
        if (write.stealWithDelta !== undefined || adversaryActive) {
            const wallet = db.rows.get(write.id);
            wallet.balance = (BigInt(wallet.balance) + (write.stealWithDelta ?? 1000n)).toString();
        }
        return db.casUpdate(write.id, write.expectedBalance, write.nextBalance);
    }
    const mockRepo = {
        create: vitest_1.vi.fn((data) => {
            const wallet = new wallet_entity_1.Wallet();
            Object.assign(wallet, data, {
                id: data.id ?? crypto.randomUUID(),
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            return wallet;
        }),
        save: vitest_1.vi.fn(async (wallet) => {
            db.rows.set(wallet.id, wallet);
            return wallet;
        }),
        findOne: vitest_1.vi.fn(async ({ where, }) => {
            for (const wallet of db.rows.values()) {
                if (where.id && wallet.id !== where.id)
                    continue;
                if (where.userId && wallet.userId !== where.userId)
                    continue;
                if (where.assetCode && wallet.assetCode !== where.assetCode)
                    continue;
                return wallet;
            }
            return null;
        }),
        manager: {
            transaction: async (work) => work(mockManager),
        },
    };
    /**
     * Per-attempt transaction mock: `findOne` reads the fake DB and the
     * QueryBuilder's `execute()` applies the guarded write through the fake DB,
     * returning the true affected-row count so the service's CAS loop sees
     * realistic guard misses. With the gate closed, writes are held until the
     * test releases them, producing the exact lost-update interleaving.
     */
    const mockManager = {
        // TypeORM's EntityManager.findOne(entityClass, options) — the entity comes
        // first, so the criteria object must be taken from the second argument.
        findOne: async (_entity, { where }) => {
            const wallet = db.findOne(where.id);
            return wallet ? { ...wallet } : null;
        },
        createQueryBuilder: () => {
            const builder = {
                params: undefined,
                update() {
                    return this;
                },
                set(value) {
                    builder.params = {
                        id: builder.params?.id ?? '',
                        expectedBalance: builder.params?.expectedBalance ?? '',
                        next: value.balance,
                    };
                    return this;
                },
                where(_condition, params) {
                    builder.params = { ...builder.params, ...params };
                    return this;
                },
                async execute() {
                    executeCalls += 1;
                    const { id, expectedBalance, next } = builder.params;
                    const write = {
                        id,
                        expectedBalance,
                        nextBalance: next ?? BigInt(expectedBalance).toString(),
                    };
                    if (gateClosed) {
                        queuedWrites.push(write);
                        await gateOpen;
                    }
                    return { affected: applyWrite(write) };
                },
            };
            return builder;
        },
    };
    /** Let every pending microtask chain (service attempts) settle. */
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    function closeGate() {
        gateClosed = true;
        queuedWrites = [];
        gateOpen = new Promise((resolve) => {
            openGate = () => {
                gateClosed = false;
                resolve();
            };
        });
    }
    (0, vitest_1.beforeEach)(async () => {
        db = new FakeWalletDb();
        queuedWrites = [];
        gateClosed = false;
        gateOpen = Promise.resolve();
        adversaryActive = false;
        executeCalls = 0;
        const module = await testing_1.Test.createTestingModule({
            providers: [
                wallets_service_1.WalletsService,
                { provide: (0, typeorm_1.getRepositoryToken)(wallet_entity_1.Wallet), useValue: mockRepo },
            ],
        }).compile();
        service = module.get(wallets_service_1.WalletsService);
    });
    (0, vitest_1.afterEach)(() => {
        // Never leak a closed gate into the next test.
        gateClosed = false;
        adversaryActive = false;
    });
    (0, vitest_1.describe)('CAS update mechanics', () => {
        (0, vitest_1.it)('credits a wallet with zero retries when there is no contention', async () => {
            const wallet = db.createWallet({ balance: '100' });
            const result = await service.creditBalance(wallet.id, 50);
            (0, vitest_1.expect)(result.retries).toBe(0);
            (0, vitest_1.expect)(result.previousBalance).toBe('100');
            (0, vitest_1.expect)(db.rows.get(wallet.id).balance).toBe('150');
        });
        (0, vitest_1.it)('debits a wallet without letting the balance go negative', async () => {
            const wallet = db.createWallet({ balance: '75' });
            await (0, vitest_1.expect)(service.debitBalance(wallet.id, 100)).rejects.toThrow(wallets_service_1.InsufficientBalanceError);
            (0, vitest_1.expect)(db.rows.get(wallet.id).balance).toBe('75');
        });
        (0, vitest_1.it)('throws NotFoundException for a missing wallet', async () => {
            await (0, vitest_1.expect)(service.creditBalance('missing-wallet', 10)).rejects.toThrow(/not found/);
        });
        (0, vitest_1.it)('rejects negative delta amounts outright', async () => {
            const wallet = db.createWallet({ balance: '50' });
            await (0, vitest_1.expect)(service.creditBalance(wallet.id, -5)).rejects.toThrow(/non-negative/);
            (0, vitest_1.expect)(db.rows.get(wallet.id).balance).toBe('50');
        });
        (0, vitest_1.it)('retries with a fresh balance read when a concurrent writer wins the row', async () => {
            const wallet = db.createWallet({ balance: '100' });
            // Hold our first guarded write, let a competing processor apply +10,
            // then release it: the stale write must miss, and the retry must
            // re-read 110 and land 115 — no lost update either way.
            closeGate();
            const pending = service.creditBalance(wallet.id, 5);
            await tick();
            (0, vitest_1.expect)(queuedWrites.length).toBe(1);
            queuedWrites[0].stealWithDelta = 10n;
            openGate();
            const result = await pending;
            (0, vitest_1.expect)(result.retries).toBe(1);
            (0, vitest_1.expect)(result.previousBalance).toBe('110');
            (0, vitest_1.expect)(db.rows.get(wallet.id).balance).toBe('115');
        });
        (0, vitest_1.it)('throws BalanceUpdateConflictError after exactly 1 + max retries attempts', async () => {
            const wallet = db.createWallet({ balance: '100' });
            // An unbounded adversary wins the row before every guarded write.
            adversaryActive = true;
            await (0, vitest_1.expect)(service.creditBalance(wallet.id, 5, { backoffMs: () => 0 })).rejects.toThrow(wallets_service_1.BalanceUpdateConflictError);
            // 1 initial attempt + MAX_BALANCE_UPDATE_RETRIES retries.
            (0, vitest_1.expect)(executeCalls).toBe(wallets_service_1.MAX_BALANCE_UPDATE_RETRIES + 1);
        });
        (0, vitest_1.it)('honors a custom maxRetries option', async () => {
            const wallet = db.createWallet({ balance: '100' });
            adversaryActive = true;
            await (0, vitest_1.expect)(service.creditBalance(wallet.id, 5, { maxRetries: 0 })).rejects.toThrow(wallets_service_1.BalanceUpdateConflictError);
            (0, vitest_1.expect)(executeCalls).toBe(1);
            // Only the adversary's writes landed.
            (0, vitest_1.expect)(db.rows.get(wallet.id).balance).toBe('1100');
        });
    });
    (0, vitest_1.describe)('concurrency — the issue #587 acceptance scenario', () => {
        (0, vitest_1.it)('10 concurrent deposits all land: final balance is exact, none lost', async () => {
            const wallet = db.createWallet({ balance: '0' });
            const deposit = 10n;
            const writers = 10;
            // Deterministic per-writer backoff: after each conflict, writer i waits
            // (i + 1) ms, desynchronizing the retries the way jittered backoff does
            // in production and letting every writer win a distinct round.
            const backoffMs = (writerIndex) => (upcomingAttempt) => (writerIndex + 1) * upcomingAttempt;
            const attempts = Array.from({ length: writers }, (_, i) => service.creditBalance(wallet.id, deposit, { backoffMs: backoffMs(i) }));
            const results = await Promise.all(attempts);
            (0, vitest_1.expect)(results).toHaveLength(writers);
            (0, vitest_1.expect)(db.rows.get(wallet.id).balance).toBe((BigInt(writers) * deposit).toString());
            // Each writer lands only once the balance it read still matches — the
            // naive pre-fix code would have dropped 9 of these 10 deposits.
            (0, vitest_1.expect)(executeCalls).toBeGreaterThanOrEqual(writers + (writers - 1));
        });
        (0, vitest_1.it)('mixed 5 credits + 5 debits race without losing or double-counting updates', async () => {
            const wallet = db.createWallet({ balance: '1000' });
            const ops = [
                ...Array.from({ length: 5 }, () => ({ kind: 'credit', amount: 100n })),
                ...Array.from({ length: 5 }, () => ({ kind: 'debit', amount: 50n })),
            ];
            // Same deterministic-jitter approach as the deposits test: stagger the
            // retries so each writer wins a distinct round instead of lockstep.
            const attempts = ops.map((op, i) => op.kind === 'credit'
                ? service.creditBalance(wallet.id, op.amount, {
                    backoffMs: (a) => (i + 1) * a,
                })
                : service.debitBalance(wallet.id, op.amount, {
                    backoffMs: (a) => (i + 1) * a,
                }));
            await Promise.all(attempts);
            // 1000 + 5*100 - 5*50 = 1250. No lost updates in either direction.
            (0, vitest_1.expect)(BigInt(db.rows.get(wallet.id).balance)).toBe(1250n);
        });
        (0, vitest_1.it)('never drives a raced wallet negative when 10 debits hit a funded balance', async () => {
            const wallet = db.createWallet({ balance: '500' });
            const amount = 50n;
            // Deterministic jitter, same rationale as the deposits test above.
            const attempts = Array.from({ length: 10 }, (_, i) => service.debitBalance(wallet.id, amount, {
                backoffMs: (a) => (i + 1) * a,
            }));
            const outcomes = await Promise.allSettled(attempts);
            const finalBalance = BigInt(db.rows.get(wallet.id).balance);
            (0, vitest_1.expect)(finalBalance).toBeGreaterThanOrEqual(0n);
            // Every committed debit is reflected exactly once; anything else
            // surfaced as a thrown error — never silent data loss.
            const fulfilled = outcomes.filter((o) => o.status === 'fulfilled').length;
            (0, vitest_1.expect)(finalBalance).toBe(500n - BigInt(fulfilled) * amount);
            for (const outcome of outcomes) {
                if (outcome.status === 'rejected') {
                    (0, vitest_1.expect)(outcome.reason).toBeInstanceOf(Error);
                }
            }
        });
    });
    (0, vitest_1.describe)('getOrCreateWallet', () => {
        (0, vitest_1.it)('returns the existing wallet instead of creating a duplicate', async () => {
            const wallet = db.createWallet({ userId: 'u1', assetCode: 'XLM' });
            const result = await service.getOrCreateWallet('u1', 'XLM');
            (0, vitest_1.expect)(result.id).toBe(wallet.id);
        });
    });
});
