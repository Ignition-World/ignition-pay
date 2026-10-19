import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sep24Service } from './sep24.service';
import { PrismaService } from '../prisma/prisma.service';
import { InitiateSep24Dto, Sep24Operation } from './dto/initiate-sep24.dto';

describe('Sep24Service', () => {
  let service: Sep24Service;
  let prisma: {
    sep24Transaction: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let config: {
    get: jest.Mock;
  };

  const mockUser1 = 'user-111-uuid';
  const mockUser2 = 'user-222-uuid';

  const mockTransactionRecord = {
    id: 'tx-123-uuid',
    userId: mockUser1,
    anchorName: 'StellarX',
    operation: 'deposit',
    stellarAccount: 'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A',
    assetCode: 'USD',
    assetIssuer: null,
    amount: '100',
    anchorTxId: 'anchor-tx-999',
    interactiveUrl: 'https://api.stellarx.com/sep24/interactive/anchor-tx-999',
    callbackToken: 'callback-token-abc',
    lastCallbackAt: null,
    status: 'incomplete',
    statusDesc: 'Awaiting user interaction',
    stellarTxHash: null,
    moreInfoUrl: null,
    message: null,
    rawAnchorResponse: null,
    startedAt: new Date('2026-08-24T10:00:00Z'),
    completedAt: null,
    updatedAt: new Date('2026-08-24T10:00:00Z'),
  };

  const originalFetch = global.fetch;

  beforeEach(async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'anchor-tx-999',
            url: 'https://api.stellarx.com/sep24/interactive/anchor-tx-999',
            status: 'incomplete',
          }),
        text: () => Promise.resolve(''),
      }),
    );

    prisma = {
      sep24Transaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    config = {
      get: jest.fn().mockReturnValue('https://api.ignitionpay.com'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Sep24Service,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<Sep24Service>(Sep24Service);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('initiate', () => {
    const baseDto: InitiateSep24Dto = {
      anchorName: 'StellarX',
      operation: Sep24Operation.DEPOSIT,
      assetCode: 'USD',
      amount: 100,
      stellarAccount:
        'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A',
    };

    it('creates a new transaction record when no transactionId is provided', async () => {
      prisma.sep24Transaction.create.mockResolvedValue({
        ...mockTransactionRecord,
        id: 'tx-new-id',
        anchorTxId: 'sim-12345',
        interactiveUrl: 'https://api.stellarx.com/sep24/interactive/sim-12345',
        startedAt: new Date('2026-08-25T12:00:00Z'),
      });

      const result = await service.initiate(baseDto, mockUser1);

      expect(prisma.sep24Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser1,
            anchorName: 'StellarX',
            operation: 'deposit',
            stellarAccount: baseDto.stellarAccount,
            assetCode: 'USD',
          }),
        }),
      );
      expect(result.id).toBe('tx-new-id');
      expect(result.interactiveUrl).toContain('interactive');
      expect(result.status).toBe('incomplete');
    });

    it('resumes flow and returns interactive URL when transactionId belongs to caller', async () => {
      prisma.sep24Transaction.findFirst.mockResolvedValue(
        mockTransactionRecord,
      );
      prisma.sep24Transaction.update.mockResolvedValue({
        ...mockTransactionRecord,
        interactiveUrl:
          'https://api.stellarx.com/sep24/interactive/anchor-tx-999',
      });

      const result = await service.initiate(
        {
          ...baseDto,
          transactionId: 'tx-123-uuid',
        },
        mockUser1,
      );

      expect(prisma.sep24Transaction.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: 'tx-123-uuid' }, { anchorTxId: 'tx-123-uuid' }],
        },
      });
      expect(prisma.sep24Transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-123-uuid' },
        data: expect.objectContaining({
          interactiveUrl: expect.any(String),
        }),
      });
      expect(result.id).toBe('tx-123-uuid');
      expect(result.interactiveUrl).toBeTruthy();
    });

    it('resumes flow and returns interactive URL when snake_case transaction_id belongs to caller', async () => {
      prisma.sep24Transaction.findFirst.mockResolvedValue(
        mockTransactionRecord,
      );
      prisma.sep24Transaction.update.mockResolvedValue({
        ...mockTransactionRecord,
        interactiveUrl:
          'https://api.stellarx.com/sep24/interactive/anchor-tx-999',
      });

      const result = await service.initiate(
        {
          ...baseDto,
          transaction_id: 'anchor-tx-999',
        },
        mockUser1,
      );

      expect(prisma.sep24Transaction.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: 'anchor-tx-999' }, { anchorTxId: 'anchor-tx-999' }],
        },
      });
      expect(result.id).toBe('tx-123-uuid');
      expect(result.interactiveUrl).toBeTruthy();
    });

    it('throws ForbiddenException when transactionId belongs to another user (Issue #425)', async () => {
      prisma.sep24Transaction.findFirst.mockResolvedValue(
        mockTransactionRecord,
      ); // owned by mockUser1

      // Caller is mockUser2 (cross-user attack)
      await expect(
        service.initiate(
          {
            ...baseDto,
            transactionId: 'tx-123-uuid',
          },
          mockUser2,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.sep24Transaction.update).not.toHaveBeenCalled();
      expect(prisma.sep24Transaction.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when transactionId does not exist', async () => {
      prisma.sep24Transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.initiate(
          {
            ...baseDto,
            transactionId: 'non-existent-id',
          },
          mockUser1,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when transaction operation does not match existing record', async () => {
      prisma.sep24Transaction.findFirst.mockResolvedValue(
        mockTransactionRecord,
      ); // operation is deposit

      await expect(
        service.initiate(
          {
            ...baseDto,
            operation: Sep24Operation.WITHDRAW,
            transactionId: 'tx-123-uuid',
          },
          mockUser1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when anchorName is unknown', async () => {
      await expect(
        service.initiate(
          {
            ...baseDto,
            anchorName: 'UnknownAnchor',
          },
          mockUser1,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatus', () => {
    it('returns transaction status when caller is the owner', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );

      const result = await service.getStatus('tx-123-uuid', mockUser1);

      expect(result.id).toBe('tx-123-uuid');
      expect(result.status).toBe('incomplete');
      expect(result.anchorTxId).toBe('anchor-tx-999');
    });

    it('returns transaction status when userId is not supplied (internal caller)', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );

      const result = await service.getStatus('tx-123-uuid');

      expect(result.id).toBe('tx-123-uuid');
    });

    it('throws ForbiddenException when caller is not the owner (Issue #425)', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );

      await expect(service.getStatus('tx-123-uuid', mockUser2)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.getStatus('non-existent-tx', mockUser1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('returns anchor details when caller is the owner', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );

      const result = await service.findById('tx-123-uuid', mockUser1);

      expect(result.anchorName).toBe('StellarX');
      expect(result.anchorTxId).toBe('anchor-tx-999');
    });

    it('throws ForbiddenException when caller is not the owner', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );

      await expect(service.findById('tx-123-uuid', mockUser2)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when transaction not found', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.findById('non-existent-tx', mockUser1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleCallback', () => {
    it('updates transaction status when callback token matches', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );
      prisma.sep24Transaction.update.mockResolvedValue({
        ...mockTransactionRecord,
        status: 'completed',
      });

      await service.handleCallback('callback-token-abc', {
        id: 'anchor-tx-999',
        status: 'completed',
        stellar_transaction_hash: 'tx-hash-xyz',
      });

      expect(prisma.sep24Transaction.update).toHaveBeenCalledWith({
        where: { id: mockTransactionRecord.id },
        data: expect.objectContaining({
          status: 'completed',
          stellarTxHash: 'tx-hash-xyz',
        }),
      });
    });

    it('throws NotFoundException when callback token is unknown', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.handleCallback('unknown-token', { id: 'anchor-tx-999' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when anchor transaction id mismatches', async () => {
      prisma.sep24Transaction.findUnique.mockResolvedValue(
        mockTransactionRecord,
      );

      await expect(
        service.handleCallback('callback-token-abc', {
          id: 'wrong-anchor-tx-id',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getHistory', () => {
    it('queries transactions scoped to the caller userId with pagination', async () => {
      prisma.sep24Transaction.findMany.mockResolvedValue([
        mockTransactionRecord,
      ]);
      prisma.sep24Transaction.count.mockResolvedValue(1);

      const result = await service.getHistory(mockUser1, {
        page: 1,
        limit: 10,
        operation: Sep24Operation.DEPOSIT,
      });

      expect(prisma.sep24Transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser1,
            operation: Sep24Operation.DEPOSIT,
          }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(mockTransactionRecord.id);
    });
  });
});
