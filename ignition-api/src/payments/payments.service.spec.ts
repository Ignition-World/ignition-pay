import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_PAYMENTS } from '../queue/queue.constants';
import { PAYMENT_JOB_PROCESS } from '../queue/queue.jobs';
import { DashboardCacheService } from '../users/dashboard-cache.service';

// ── Factories ────────────────────────────────────────────────────────────────

const makeWallet = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'wallet-sender-1',
  userId: 'user-1',
  isActive: true,
  dailyLimit: '1000.0000000',
  monthlyLimit: '10000.0000000',
  depositAddress: 'GSENDER000000000000000000000000000000000000000000000000',
  ...overrides,
});

const makeTransaction = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'txn-abc-123',
  fromWalletId: 'wallet-sender-1',
  toWalletId: 'wallet-sender-1',
  amount: '50.0000000',
  assetCode: 'XLM',
  status: 'PENDING',
  createdAt: new Date('2026-07-25T10:00:00.000Z'),
  ...overrides,
});

const makeDto = (overrides: Partial<Record<string, unknown>> = {}) => ({
  senderWalletId: 'wallet-sender-1',
  recipientAddress: 'GRECIPIENT0000000000000000000000000000000000000000000000',
  amount: '50.0000000',
  assetCode: 'XLM',
  ...overrides,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a minimal PrismaService mock for a given scenario. */
const buildPrisma = ({
  wallet = makeWallet(),
  recipientWallet = null as ReturnType<typeof makeWallet> | null,
  transaction = makeTransaction(),
  dailySpent = '0',
  monthlySpent = '0',
}: {
  wallet?: ReturnType<typeof makeWallet> | null;
  recipientWallet?: ReturnType<typeof makeWallet> | null;
  transaction?: ReturnType<typeof makeTransaction>;
  dailySpent?: string;
  monthlySpent?: string;
} = {}) => {
  return {
    wallet: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.id) return Promise.resolve(wallet);
        if (where.depositAddress) return Promise.resolve(recipientWallet);
        return Promise.resolve(null);
      }),
    },
    transaction: {
      aggregate: jest.fn().mockImplementation(({ where }: any) => {
        const since = where?.createdAt?.gte;
        const now = Date.now();
        // If since is around 30 days ago (more than 2 days ago), it's monthly
        const isMonthly =
          since && now - new Date(since).getTime() > 2 * 24 * 60 * 60 * 1000;
        const spent = isMonthly ? monthlySpent : dailySpent;
        return Promise.resolve({ _sum: { amount: spent } });
      }),
      create: jest.fn().mockResolvedValue(transaction),
    },
  };
};

/** Builds a Bull queue mock. */
const buildQueue = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
});

/** Builds a dashboard cache mock. */
const buildDashboardCache = () => ({
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof buildPrisma>;
  let queue: ReturnType<typeof buildQueue>;
  let dashboardCache: ReturnType<typeof buildDashboardCache>;

  const setup = async (prismaOverrides?: Parameters<typeof buildPrisma>[0]) => {
    prisma = buildPrisma(prismaOverrides);
    queue = buildQueue();
    dashboardCache = buildDashboardCache();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(QUEUE_PAYMENTS), useValue: queue },
        { provide: DashboardCacheService, useValue: dashboardCache },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  };

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('initiatePayment — happy path', () => {
    beforeEach(() => setup());

    it('returns a queued payment response with the persisted transaction id', async () => {
      const dto = makeDto();
      const result = await service.initiatePayment(dto as any);

      expect(result).toMatchObject({
        id: 'txn-abc-123',
        status: 'queued',
        senderWalletId: dto.senderWalletId,
        recipientAddress: dto.recipientAddress,
        amount: dto.amount,
        assetCode: dto.assetCode,
        createdAt: '2026-07-25T10:00:00.000Z',
      });
    });

    it('creates a PENDING Transaction record with the correct fields', async () => {
      await service.initiatePayment(makeDto() as any);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromWalletId: 'wallet-sender-1',
            amount: '50.0000000',
            assetCode: 'XLM',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('enqueues a payment job with the correct payload', async () => {
      const dto = makeDto();
      await service.initiatePayment(dto as any);

      expect(queue.add).toHaveBeenCalledWith(
        PAYMENT_JOB_PROCESS,
        expect.objectContaining({
          transactionId: 'txn-abc-123',
          senderWalletId: dto.senderWalletId,
          recipientAddress: dto.recipientAddress,
          amount: dto.amount,
          assetCode: dto.assetCode,
        }),
      );
    });

    it('sets toWalletId to the recipient wallet id when the address maps to an internal wallet', async () => {
      const recipientWallet = makeWallet({
        id: 'wallet-recipient-2',
        depositAddress:
          'GRECIPIENT0000000000000000000000000000000000000000000000',
      });

      await setup({ recipientWallet });
      await service.initiatePayment(makeDto() as any);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toWalletId: 'wallet-recipient-2' }),
        }),
      );
    });

    it('falls back to senderWalletId as toWalletId and stores externalRecipientAddress when recipient is external', async () => {
      await setup({ recipientWallet: null });
      const dto = makeDto();
      await service.initiatePayment(dto as any);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            toWalletId: dto.senderWalletId,
            metadata: { externalRecipientAddress: dto.recipientAddress },
          }),
        }),
      );
    });
  });

  // ── Wallet validation ──────────────────────────────────────────────────────

  describe('initiatePayment — wallet validation', () => {
    it('throws NotFoundException when the sender wallet does not exist', async () => {
      await setup({ wallet: null });

      await expect(service.initiatePayment(makeDto() as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the sender wallet is inactive', async () => {
      await setup({ wallet: makeWallet({ isActive: false }) });

      await expect(service.initiatePayment(makeDto() as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Limit enforcement ──────────────────────────────────────────────────────

  describe('initiatePayment — limit enforcement', () => {
    it('throws UnprocessableEntityException when the payment would exceed the rolling 24-hour limit', async () => {
      // dailyLimit=1000, already spent 800, attempting 300 → 1100 > 1000
      await setup({
        wallet: makeWallet({ dailyLimit: '1000.0000000', monthlyLimit: null }),
        dailySpent: '800.0000000',
      });

      await expect(
        service.initiatePayment(makeDto({ amount: '300.0000000' }) as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when the payment would exceed the rolling 30-day limit', async () => {
      // dailyLimit=null, monthlyLimit=500, already spent 400, attempting 200 → 600 > 500
      await setup({
        wallet: makeWallet({ dailyLimit: null, monthlyLimit: '500.0000000' }),
        monthlySpent: '400.0000000',
      });

      await expect(
        service.initiatePayment(makeDto({ amount: '200.0000000' }) as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('passes validation when the wallet has no limits configured', async () => {
      await setup({
        wallet: makeWallet({ dailyLimit: null, monthlyLimit: null }),
      });

      await expect(
        service.initiatePayment(makeDto() as any),
      ).resolves.not.toThrow();
    });

    it('passes validation when spend is exactly at the daily limit boundary', async () => {
      // dailyLimit=1000, spent=950, attempting=50 → exactly 1000, not over
      await setup({
        wallet: makeWallet({ dailyLimit: '1000.0000000', monthlyLimit: null }),
        dailySpent: '950.0000000',
      });

      await expect(
        service.initiatePayment(makeDto({ amount: '50.0000000' }) as any),
      ).resolves.not.toThrow();
    });

    it('does not enqueue or persist when a limit is exceeded', async () => {
      await setup({
        wallet: makeWallet({ dailyLimit: '100.0000000', monthlyLimit: null }),
        dailySpent: '100.0000000',
      });

      await expect(
        service.initiatePayment(makeDto({ amount: '1.0000000' }) as any),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
