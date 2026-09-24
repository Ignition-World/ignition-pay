import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentsService } from './payments.service';
import {
  BalanceUpdateConflictError,
  InsufficientBalanceError,
  WalletsService,
} from '../wallets/wallets.service';
import type { Wallet } from '../wallets/entities/wallet.entity';

/**
 * Scripted stand-in for WalletsService. The real CAS safety lives (and is
 * tested) in `wallets.service.spec.ts`; this fake lets the payments tests
 * focus on orchestration: leg ordering, idempotency, and compensation when a
 * leg fails after the other already committed.
 */
class FakeWalletsService {
  balances = new Map<string, string>();
  debitCalls: Array<{ walletId: string; amount: bigint }> = [];
  creditCalls: Array<{ walletId: string; amount: bigint }> = [];

  debitImpl = async (walletId: string, amount: bigint) =>
    this.applyDelta(walletId, -amount);
  creditImpl = async (walletId: string, amount: bigint) =>
    this.applyDelta(walletId, amount);

  async debitBalance(walletId: string, amount: bigint) {
    this.debitCalls.push({ walletId, amount });
    return this.debitImpl(walletId, amount);
  }

  async creditBalance(walletId: string, amount: bigint) {
    this.creditCalls.push({ walletId, amount });
    return this.creditImpl(walletId, amount);
  }

  async getWallet(walletId: string) {
    const balance = this.balances.get(walletId);
    if (balance === undefined) {
      throw new Error(`Wallet with ID ${walletId} not found`);
    }
    return { id: walletId, balance } as Wallet;
  }

  applyDelta(walletId: string, signed: bigint) {
    const current = BigInt(this.balances.get(walletId) ?? '0');
    const next = current + signed;
    if (next < 0n) {
      throw new InsufficientBalanceError(walletId, current.toString(), -signed);
    }
    this.balances.set(walletId, next.toString());
    return {
      wallet: { id: walletId, balance: next.toString() } as Wallet,
      previousBalance: current.toString(),
      retries: 0,
    };
  }
}

describe('PaymentsService — issue #587 concurrency-safe payments', () => {
  let fakeWallets: FakeWalletsService;
  let service: PaymentsService;

  beforeEach(() => {
    fakeWallets = new FakeWalletsService();
    fakeWallets.balances.set('source', '1000');
    fakeWallets.balances.set('destination', '0');
    service = new PaymentsService(fakeWallets as unknown as WalletsService);
  });

  it('processes a payment by debiting the source and crediting the destination', async () => {
    const result = await service.processPayment({
      sourceWalletId: 'source',
      destinationWalletId: 'destination',
      amountStroops: 250n,
    });

    expect(fakeWallets.balances.get('source')).toBe('750');
    expect(fakeWallets.balances.get('destination')).toBe('250');
    expect(result.status).toBe('completed');
    expect(result.amountStroops).toBe('250');
    expect(result.retries).toBe(0);
  });

  it('refuses self-payments and non-positive amounts before touching any wallet', async () => {
    await expect(
      service.processPayment({
        sourceWalletId: 'source',
        destinationWalletId: 'source',
        amountStroops: 10n,
      }),
    ).rejects.toThrow(/must differ/);

    await expect(
      service.processPayment({
        sourceWalletId: 'source',
        destinationWalletId: 'destination',
        amountStroops: 0n,
      }),
    ).rejects.toThrow(/must be positive/);

    expect(fakeWallets.debitCalls).toHaveLength(0);
    expect(fakeWallets.creditCalls).toHaveLength(0);
  });

  it('rejects a duplicate idempotency key instead of paying twice', async () => {
    const request = {
      sourceWalletId: 'source',
      destinationWalletId: 'destination',
      amountStroops: 100n,
      idempotencyKey: 'key-1',
    };

    await service.processPayment(request);

    await expect(service.processPayment(request)).rejects.toThrow(
      /already processed/,
    );
    expect(fakeWallets.debitCalls).toHaveLength(1);
    expect(fakeWallets.balances.get('destination')).toBe('100');
  });

  it('does not credit the destination when the debit leg fails', async () => {
    fakeWallets.debitImpl = async (walletId, amount) => {
      const current = BigInt(fakeWallets.balances.get(walletId) ?? '0');
      throw new InsufficientBalanceError(walletId, current.toString(), amount);
    };

    await expect(
      service.processPayment({
        sourceWalletId: 'source',
        destinationWalletId: 'destination',
        amountStroops: 5000n,
      }),
    ).rejects.toThrow(InsufficientBalanceError);

    expect(fakeWallets.creditCalls).toHaveLength(0);
    expect(fakeWallets.balances.get('source')).toBe('1000');
  });

  it('refunds the source when the credit leg fails so no funds are stranded', async () => {
    fakeWallets.creditImpl = async (walletId, amount) => {
      if (walletId === 'destination') {
        throw new BalanceUpdateConflictError(walletId, 4);
      }
      return fakeWallets.applyDelta(walletId, amount);
    };

    await expect(
      service.processPayment({
        sourceWalletId: 'source',
        destinationWalletId: 'destination',
        amountStroops: 250n,
      }),
    ).rejects.toThrow(BalanceUpdateConflictError);

    // Debit landed, destination credit failed, compensation credit restored
    // the source: conservation holds (1000 - 250 + 250 = 1000).
    expect(fakeWallets.balances.get('source')).toBe('1000');
    expect(fakeWallets.balances.get('destination')).toBe('0');
    expect(fakeWallets.creditCalls.map((c) => c.walletId)).toEqual([
      'destination',
      'source',
    ]);
  });

  it('records deposits through the concurrency-safe credit path', async () => {
    fakeWallets.balances.set('destination', '25');

    const result = await service.recordDeposit('destination', 50n);

    expect(fakeWallets.creditCalls).toEqual([
      { walletId: 'destination', amount: 50n },
    ]);
    expect(result).toEqual({
      walletId: 'destination',
      amountStroops: '50',
      balanceStroops: '75',
      retries: 0,
    });
  });

  it('rejects deposits into a missing wallet before any credit is attempted', async () => {
    await expect(service.recordDeposit('ghost', 10n)).rejects.toThrow(
      /not found/,
    );
    expect(fakeWallets.creditCalls).toHaveLength(0);
  });

  it('rejects non-positive deposits', async () => {
    await expect(service.recordDeposit('destination', 0n)).rejects.toThrow(
      /must be positive/,
    );
    expect(fakeWallets.creditCalls).toHaveLength(0);
  });

  it('keeps balances conserved when 10 payments race through the service', async () => {
    // Every payment moves 10 stroops source -> destination concurrently. The
    // wallets layer's CAS guarantees each debit/credit lands exactly once, so
    // conservation must hold regardless of interleaving.
    const payments = 10;
    const amount = 10n;

    const results = await Promise.all(
      Array.from({ length: payments }, () =>
        service.processPayment({
          sourceWalletId: 'source',
          destinationWalletId: 'destination',
          amountStroops: amount,
        }),
      ),
    );

    expect(results).toHaveLength(payments);
    expect(fakeWallets.balances.get('source')).toBe(
      (1000n - BigInt(payments) * amount).toString(),
    );
    expect(fakeWallets.balances.get('destination')).toBe(
      (BigInt(payments) * amount).toString(),
    );
  });
});
