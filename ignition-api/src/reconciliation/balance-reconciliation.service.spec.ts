import { Test, TestingModule } from '@nestjs/testing';
import { BalanceReconciliationService } from './balance-reconciliation.service';
import { getQueueToken } from '@nestjs/bull';
import { QUEUE_EMAIL } from '../queue/queue.constants';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationStatus } from '@prisma/client';

describe('BalanceReconciliationService', () => {
  let service: BalanceReconciliationService;
  let prismaMock: jest.Mocked<PrismaService>;
  let queueMock: { add: jest.Mock };
  let configMock: Partial<ConfigService>;

  beforeEach(async () => {
    prismaMock = {
      wallet: {
        findMany: jest.fn(),
      },
      balanceDiscrepancy: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    queueMock = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    configMock = { get: jest.fn().mockReturnValue('') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceReconciliationService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        { provide: getQueueToken(QUEUE_EMAIL), useValue: queueMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<BalanceReconciliationService>(BalanceReconciliationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should flag balance discrepancy when DB and Horizon balance drift', async () => {
    const mockWallet = {
      id: 'wallet-123',
      stellarAddress: 'GABCD1234567890',
      balance: '100.0000000',
      isActive: true,
    };

    prismaMock.wallet.findMany.mockResolvedValue([
      {
        id: mockWallet.id,
        depositAddress: mockWallet.stellarAddress,
        balance: '100.0000000',
        isActive: true,
      },
    ]);

    jest.spyOn(service as any, 'horizonServer').mockValue({
      loadAccount: jest.fn().mockResolvedValue({
        balances: [{ asset_type: 'native', balance: '95.0000000' }],
      }),
    } as any);

    prismaMock.balanceDiscrepancy.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb) => {
      const tx = {
        balanceDiscrepancy: {
          findFirst: prismaMock.balanceDiscrepancy.findFirst,
          create: jest.fn().mockResolvedValue({ id: 'disc-123' }),
          update: jest.fn(),
        },
      };
      return cb(tx);
    });

    const isDiscrepant = await service.reconcileWallet(mockWallet);

    expect(isDiscrepant).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('should not create duplicate PENDING discrepancy for same wallet', async () => {
    const mockWallet = {
      id: 'wallet-123',
      stellarAddress: 'GABCD1234567890',
      balance: '100.0000000',
      isActive: true,
    };

    jest.spyOn(service as any, 'horizonServer').mockValue({
      loadAccount: jest.fn().mockResolvedValue({
        balances: [{ asset_type: 'native', balance: '95.0000000' }],
      }),
    } as any);

    prismaMock.balanceDiscrepancy.findFirst.mockResolvedValue({
      id: 'existing-disc',
      walletId: 'wallet-123',
      status: ReconciliationStatus.PENDING,
    });

    prismaMock.$transaction.mockImplementation(async (cb) => {
      const tx = {
        balanceDiscrepancy: {
          findFirst: prismaMock.balanceDiscrepancy.findFirst,
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 'existing-disc' }),
        },
      };
      return cb(tx);
    });

    const isDiscrepant = await service.reconcileWallet(mockWallet);

    expect(isDiscrepant).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('should create new discrepancy when previous was resolved', async () => {
    const mockWallet = {
      id: 'wallet-123',
      stellarAddress: 'GABCD1234567890',
      balance: '100.0000000',
      isActive: true,
    };

    jest.spyOn(service as any, 'horizonServer').mockValue({
      loadAccount: jest.fn().mockResolvedValue({
        balances: [{ asset_type: 'native', balance: '95.0000000' }],
      }),
    } as any);

    prismaMock.balanceDiscrepancy.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(async (cb) => {
      const tx = {
        balanceDiscrepancy: {
          findFirst: prismaMock.balanceDiscrepancy.findFirst,
          create: jest.fn().mockResolvedValue({ id: 'new-disc' }),
          update: jest.fn(),
        },
      };
      return cb(tx);
    });

    const isDiscrepant = await service.reconcileWallet(mockWallet);

    expect(isDiscrepant).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
