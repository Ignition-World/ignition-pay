import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';

const allowAllGuard = { canActivate: (_ctx: ExecutionContext) => true };

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: jest.Mocked<Pick<TransactionsService, 'getTransactions' | 'estimateFee'>>;

  beforeEach(async () => {
    service = {
      getTransactions: jest.fn(),
      estimateFee: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        { provide: TransactionsService, useValue: service },
        {
          provide: PermissionsService,
          useValue: { getUserPermissions: jest.fn() },
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(allowAllGuard)
      .overrideGuard(ApiKeyScopeGuard)
      .useValue(allowAllGuard)
      .compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('estimateFee() should call transactionsService.estimateFee', async () => {
    const query = { assetCode: 'XLM' };
    const mockResponse = {
      feeAmount: '0.0000100',
      assetCode: 'XLM',
      fiatAmount: '0.0000',
      fiatCurrency: 'USD',
      minimumNetworkFee: '0.0000100',
      feeType: 'standard',
    };
    service.estimateFee.mockResolvedValue(mockResponse as any);

    const res = await controller.estimateFee(query);

    expect(service.estimateFee).toHaveBeenCalledWith(query);
    expect(res).toEqual(mockResponse);
  });

  it('getTransactions() should call transactionsService.getTransactions and return cursor-paginated result', async () => {
    const query = { limit: 10 };
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasMore: false,
      limit: 10,
    };
    service.getTransactions.mockResolvedValue(mockResponse as any);

    const res = await controller.getTransactions(query);

    expect(service.getTransactions).toHaveBeenCalledWith(query);
    expect(res).toEqual(mockResponse);
  });

  it('getTransactions() passes cursor and filters to service', async () => {
    const query = {
      cursor: 'some-opaque-cursor',
      limit: 5,
      status: 'PENDING',
      type: 'XLM',
    };
    service.getTransactions.mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
      limit: 5,
    } as any);

    await controller.getTransactions(query);

    expect(service.getTransactions).toHaveBeenCalledWith(query);
  });

  it('getTransactions() forwards a nextCursor in the response', async () => {
    const opaqueCursor = Buffer.from('txn-99', 'utf8').toString('base64');
    service.getTransactions.mockResolvedValue({
      data: [{ id: 'txn-99' } as any],
      nextCursor: opaqueCursor,
      hasMore: true,
      limit: 1,
    });

    const result = await controller.getTransactions({ limit: 1 });
    expect(result.nextCursor).toBe(opaqueCursor);
    expect(result.hasMore).toBe(true);
  });
});
