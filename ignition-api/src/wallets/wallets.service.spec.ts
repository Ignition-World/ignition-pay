import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WalletStatus, WalletType } from '@prisma/client';

jest.mock('@stellar/stellar-sdk', () => {
  const validPublicKey =
    'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS';
  return {
    __esModule: true,
    default: {
      Server: jest.fn().mockImplementation(() => ({
        accounts() {
          return {
            accountId: () => ({
              call: async () => ({
                balances: [{ asset_type: 'native', balance: '100.0' }],
              }),
            }),
          };
        },
        payments() {
          return {
            forAccount: () => ({
              order: () => ({
                limit: () => ({
                  call: async () => ({
                    records: [
                      {
                        id: '1',
                        type: 'payment',
                        from: 'A',
                        to: 'B',
                        amount: '50',
                        asset_type: 'native',
                        created_at: new Date().toISOString(),
                      },
                    ],
                  }),
                }),
              }),
            }),
          };
        },
      })),
      Keypair: {
        random: jest.fn(() => ({ publicKey: () => validPublicKey })),
      },
    },
    StrKey: {
      isValidEd25519PublicKey: (s: string) => !!s && s.startsWith('G'),
    },
  };
});

import { WalletsService } from './wallets.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DEFAULT_WALLET_LIMITS } from '../wallet/services/wallet-limit.service';

const mockWallet = {
  id: 'wallet-uuid',
  userId: 'user-uuid',
  network: 'STELLAR',
  depositAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
  label: null,
  walletType: WalletType.CUSTODIAL,
  status: WalletStatus.ACTIVE,
  dailyLimit: 1000,
  monthlyLimit: 10000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockDeletedWallet = {
  ...mockWallet,
  id: 'deleted-wallet-uuid',
  isActive: false,
  status: WalletStatus.CLOSED,
  deletedAt: new Date('2026-08-25T12:00:00.000Z'),
};

const buildMockPrisma = (
  overrides: Partial<{ user: any; wallet: any; walletsList: any[] }> = {},
) => ({
  user: {
    findUnique: jest
      .fn()
      .mockResolvedValue(
        'user' in overrides ? overrides.user : { id: 'user-uuid' },
      ),
  },
  wallet: {
    findUnique: jest
      .fn()
      .mockResolvedValue('wallet' in overrides ? overrides.wallet : null),
    findFirst: jest.fn().mockImplementation(({ where }: any) => {
      if (where?.id === 'deleted-wallet-uuid') {
        if (where.deletedAt === null) return Promise.resolve(null);
        return Promise.resolve(mockDeletedWallet);
      }
      if (where?.id === 'wallet-uuid') {
        return Promise.resolve(mockWallet);
      }
      if ('wallet' in overrides) return Promise.resolve(overrides.wallet);
      return Promise.resolve(null);
    }),
    findMany: jest
      .fn()
      .mockResolvedValue(
        'walletsList' in overrides ? overrides.walletsList : [mockWallet],
      ),
    create: jest.fn().mockResolvedValue(mockWallet),
    update: jest.fn().mockImplementation(({ where, data }: any) => {
      const base =
        where.id === 'deleted-wallet-uuid' ? mockDeletedWallet : mockWallet;
      return Promise.resolve({ ...base, ...data });
    }),
  },
});

const buildMockWalletLimitService = () => ({
  resolveCreationLimits: jest.fn((dto: CreateWalletDto = {}) => ({
    dailyLimit: dto.dailyLimit ?? DEFAULT_WALLET_LIMITS.dailyLimit,
    monthlyLimit: dto.monthlyLimit ?? DEFAULT_WALLET_LIMITS.monthlyLimit,
  })),
});

describe('WalletsService', () => {
  let service: WalletsService;
  let cache: Keyv;
  let prisma: ReturnType<typeof buildMockPrisma>;
  let walletLimitService: ReturnType<typeof buildMockWalletLimitService>;

  beforeEach(() => {
    const config = new ConfigService({
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      BALANCE_CACHE_TTL_SEC: '1',
    });
    cache = new Keyv();
    prisma = buildMockPrisma();
    walletLimitService = buildMockWalletLimitService();
    service = new WalletsService(
      config,
      cache,
      prisma as any,
      walletLimitService as any,
    );
  });

  // ------- createWallet tests -------

  describe('createWallet', () => {
    it('creates a wallet with auto-generated deposit address', async () => {
      const result = await service.createWallet('user-uuid', {});
      expect(result).toHaveProperty('id', 'wallet-uuid');
      expect(result).toHaveProperty('depositAddress');
      expect(result.network).toBe('STELLAR');
      expect(result.dailyLimit).toBe(1000);
      expect(result.monthlyLimit).toBe(10000);
      expect(walletLimitService.resolveCreationLimits).toHaveBeenCalledWith({});
      expect(prisma.wallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining(DEFAULT_WALLET_LIMITS),
        }),
      );
    });

    it('creates a wallet with a provided valid deposit address', async () => {
      const result = await service.createWallet('user-uuid', {
        depositAddress:
          'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        label: 'My Wallet',
        dailyLimit: 500,
        monthlyLimit: 5000,
      });
      expect(result.label).toBe(null);
      expect(prisma.wallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-uuid',
            dailyLimit: 500,
            monthlyLimit: 5000,
          }),
        }),
      );
    });

    it('throws NotFoundException if user does not exist', async () => {
      const noPrisma = buildMockPrisma({ user: null });
      service = new WalletsService(
        new ConfigService(),
        cache,
        noPrisma as any,
        walletLimitService as any,
      );
      await expect(service.createWallet('bad-user', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for invalid Stellar deposit address', async () => {
      await expect(
        service.createWallet('user-uuid', {
          depositAddress: 'invalid-address',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if deposit address is already taken', async () => {
      const conflictPrisma = buildMockPrisma({ wallet: mockWallet });
      service = new WalletsService(
        new ConfigService(),
        cache,
        conflictPrisma as any,
        walletLimitService as any,
      );
      await expect(
        service.createWallet('user-uuid', {
          depositAddress:
            'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789ABCDEFGHIJKLMNOPQRS',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ------- soft-delete (deleteWallet) tests (Issue #424) -------

  describe('deleteWallet (Issue #424)', () => {
    it('soft-deletes an active wallet by setting deletedAt, isActive=false, status=CLOSED', async () => {
      const result = await service.deleteWallet('wallet-uuid', 'user-uuid');

      expect(prisma.wallet.findFirst).toHaveBeenCalledWith({
        where: { id: 'wallet-uuid', deletedAt: null },
      });
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-uuid' },
        data: expect.objectContaining({
          isActive: false,
          status: WalletStatus.CLOSED,
          deletedAt: expect.any(Date),
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          message: 'Wallet deleted successfully',
          id: 'wallet-uuid',
        }),
      );
    });

    it('throws NotFoundException when trying to delete non-existent or already soft-deleted wallet', async () => {
      await expect(
        service.deleteWallet('deleted-wallet-uuid', 'user-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-owner attempts to delete wallet', async () => {
      await expect(
        service.deleteWallet('wallet-uuid', 'other-user-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ------- restoreWallet tests -------

  describe('restoreWallet', () => {
    it('restores a soft-deleted wallet by setting deletedAt=null, isActive=true, status=ACTIVE', async () => {
      prisma.wallet.findUnique.mockResolvedValue(mockDeletedWallet);

      const result = await service.restoreWallet(
        'deleted-wallet-uuid',
        'user-uuid',
      );

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'deleted-wallet-uuid' },
        data: {
          deletedAt: null,
          isActive: true,
          status: WalletStatus.ACTIVE,
        },
      });
      expect(result).toEqual({
        success: true,
        message: 'Wallet restored successfully',
        id: 'deleted-wallet-uuid',
      });
    });

    it('throws NotFoundException when wallet does not exist', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);

      await expect(
        service.restoreWallet('unknown-id', 'user-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when wallet is not deleted', async () => {
      prisma.wallet.findUnique.mockResolvedValue(mockWallet);

      await expect(
        service.restoreWallet('wallet-uuid', 'user-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when non-owner attempts restore', async () => {
      prisma.wallet.findUnique.mockResolvedValue(mockDeletedWallet);

      await expect(
        service.restoreWallet('deleted-wallet-uuid', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ------- getWalletById tests -------

  describe('getWalletById', () => {
    it('returns wallet when active and caller is owner', async () => {
      const result = await service.getWalletById('wallet-uuid', 'user-uuid');

      expect(result.id).toBe('wallet-uuid');
      expect(result.isActive).toBe(true);
      expect(result.deletedAt).toBeUndefined();
    });

    it('throws NotFoundException for soft-deleted wallet by default', async () => {
      await expect(
        service.getWalletById('deleted-wallet-uuid', 'user-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns soft-deleted wallet when includeDeleted=true', async () => {
      const result = await service.getWalletById(
        'deleted-wallet-uuid',
        'user-uuid',
        true,
      );

      expect(result.id).toBe('deleted-wallet-uuid');
      expect(result.isActive).toBe(false);
      expect(result.deletedAt).toBeDefined();
    });

    it('throws ForbiddenException when caller is not owner', async () => {
      await expect(
        service.getWalletById('wallet-uuid', 'stranger-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ------- getWalletsByUser tests -------

  describe('getWalletsByUser', () => {
    it('queries only non-deleted wallets by default (deletedAt: null)', async () => {
      await service.getWalletsByUser('user-uuid');

      expect(prisma.wallet.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('includes soft-deleted wallets when includeDeleted=true', async () => {
      await service.getWalletsByUser('user-uuid', true);

      expect(prisma.wallet.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ------- getBalanceAndRecentTransactions tests -------

  describe('getBalanceAndRecentTransactions', () => {
    it('returns balances and recent transactions for valid address', async () => {
      const res = await service.getBalanceAndRecentTransactions('GABCDEF123');
      expect(res).toHaveProperty('balances');
      expect(Array.isArray(res.balances)).toBe(true);
      expect(res.balances[0].balance).toBe('100.0');
      expect(res).toHaveProperty('recentTransactions');
      expect(res.recentTransactions.length).toBeGreaterThan(0);
    });

    it('throws NotFoundException if the wallet is soft-deleted', async () => {
      prisma.wallet.findUnique.mockResolvedValue(mockDeletedWallet);

      await expect(
        service.getBalanceAndRecentTransactions(
          mockDeletedWallet.depositAddress,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('caches result', async () => {
      const spySet = jest.spyOn(cache as any, 'set');
      await service.getBalanceAndRecentTransactions('GABCDEF123');
      expect(spySet).toHaveBeenCalled();
    });
  });
});
