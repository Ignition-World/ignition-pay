import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';

const allowAllGuard = { canActivate: (_ctx: ExecutionContext) => true };

describe('WalletsController', () => {
  let controller: WalletsController;
  let service: jest.Mocked<
    Pick<
      WalletsService,
      | 'createWallet'
      | 'getBalanceAndRecentTransactions'
      | 'getWalletsByUser'
      | 'getWalletById'
      | 'deleteWallet'
      | 'restoreWallet'
    >
  >;

  beforeEach(async () => {
    service = {
      createWallet: jest.fn(),
      getBalanceAndRecentTransactions: jest.fn(),
      getWalletsByUser: jest.fn(),
      getWalletById: jest.fn(),
      deleteWallet: jest.fn(),
      restoreWallet: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [{ provide: WalletsService, useValue: service }],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(allowAllGuard)
      .overrideGuard(ApiKeyScopeGuard)
      .useValue(allowAllGuard)
      .compile();

    controller = module.get<WalletsController>(WalletsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createWallet', () => {
    it('should call walletsService.createWallet', async () => {
      const req = { user: { sub: 'user-123' } };
      const dto = {
        network: 'STELLAR' as any,
        depositAddress: 'G123',
        label: 'My Wallet',
        dailyLimit: 1000,
        monthlyLimit: 10000,
      };
      service.createWallet.mockResolvedValue({
        id: 'wallet-123',
        ...dto,
      } as any);

      const res = await controller.createWallet(req, dto);

      expect(service.createWallet).toHaveBeenCalledWith('user-123', dto);
      expect(res).toEqual({ id: 'wallet-123', ...dto });
    });
  });

  describe('getWallets', () => {
    it('should call walletsService.getWalletsByUser', async () => {
      const req = { user: { sub: 'user-123' } };
      service.getWalletsByUser.mockResolvedValue([{ id: 'wallet-123' }] as any);

      const res = await controller.getWallets(req);

      expect(service.getWalletsByUser).toHaveBeenCalledWith('user-123', false);
      expect(res).toEqual([{ id: 'wallet-123' }]);
    });

    it('passes includeDeleted=true when query parameter is provided', async () => {
      const req = { user: { sub: 'user-123' } };
      service.getWalletsByUser.mockResolvedValue([{ id: 'wallet-123' }] as any);

      await controller.getWallets(req, 'true');

      expect(service.getWalletsByUser).toHaveBeenCalledWith('user-123', true);
    });
  });

  describe('getWallet', () => {
    it('should call walletsService.getWalletById', async () => {
      const req = { user: { sub: 'user-123' } };
      service.getWalletById.mockResolvedValue({ id: 'wallet-123' } as any);

      const res = await controller.getWallet(req, 'wallet-123');

      expect(service.getWalletById).toHaveBeenCalledWith(
        'wallet-123',
        'user-123',
      );
      expect(res).toEqual({ id: 'wallet-123' });
    });

    it('should throw BadRequestException if id is missing', async () => {
      const req = { user: { sub: 'user-123' } };
      await expect(controller.getWallet(req, '')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteWallet (Issue #424)', () => {
    it('should call walletsService.deleteWallet with authenticated user ID', async () => {
      const req = { user: { sub: 'user-123' } };
      service.deleteWallet.mockResolvedValue({
        success: true,
        message: 'Wallet deleted successfully',
        id: 'wallet-123',
      } as any);

      const res = await controller.deleteWallet(req, 'wallet-123');

      expect(service.deleteWallet).toHaveBeenCalledWith(
        'wallet-123',
        'user-123',
      );
      expect(res).toEqual({
        success: true,
        message: 'Wallet deleted successfully',
        id: 'wallet-123',
      });
    });

    it('should throw BadRequestException if id is missing', async () => {
      const req = { user: { sub: 'user-123' } };
      await expect(controller.deleteWallet(req, '')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('restoreWallet', () => {
    it('should call walletsService.restoreWallet with authenticated user ID', async () => {
      const req = { user: { sub: 'user-123' } };
      service.restoreWallet.mockResolvedValue({
        success: true,
        message: 'Wallet restored successfully',
        id: 'wallet-123',
      } as any);

      const res = await controller.restoreWallet(req, 'wallet-123');

      expect(service.restoreWallet).toHaveBeenCalledWith(
        'wallet-123',
        'user-123',
      );
      expect(res).toEqual({
        success: true,
        message: 'Wallet restored successfully',
        id: 'wallet-123',
      });
    });

    it('should throw BadRequestException if id is missing', async () => {
      const req = { user: { sub: 'user-123' } };
      await expect(controller.restoreWallet(req, '')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getBalance', () => {
    it('should call walletsService.getBalanceAndRecentTransactions', async () => {
      service.getBalanceAndRecentTransactions.mockResolvedValue({
        balance: '100',
        transactions: [],
      } as any);

      const res = await controller.getBalance('wallet-123');

      expect(service.getBalanceAndRecentTransactions).toHaveBeenCalledWith(
        'wallet-123',
      );
      expect(res).toEqual({ balance: '100', transactions: [] });
    });

    it('should throw BadRequestException if id is missing', async () => {
      await expect(controller.getBalance('')).rejects.toThrow(
        new BadRequestException('Missing wallet id'),
      );
    });
  });
});
