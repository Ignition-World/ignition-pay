import { Test, TestingModule } from '@nestjs/testing';
import { Sep24Controller } from './sep24.controller';
import { Sep24Service } from './sep24.service';
import { InitiateSep24Dto, Sep24Operation } from './dto/initiate-sep24.dto';

describe('Sep24Controller', () => {
  let controller: Sep24Controller;
  let service: {
    initiate: jest.Mock;
    getStatus: jest.Mock;
    getHistory: jest.Mock;
  };

  const mockUserId = 'user-sub-123';
  const mockReq = {
    user: { sub: mockUserId },
  };

  beforeEach(async () => {
    service = {
      initiate: jest.fn(),
      getStatus: jest.fn(),
      getHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [Sep24Controller],
      providers: [
        {
          provide: Sep24Service,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<Sep24Controller>(Sep24Controller);
  });

  describe('initiate', () => {
    it('passes authenticated user id to service.initiate', async () => {
      const dto: InitiateSep24Dto = {
        anchorName: 'StellarX',
        operation: Sep24Operation.DEPOSIT,
        assetCode: 'USD',
        stellarAccount:
          'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A',
        transactionId: 'tx-123',
      };
      const mockResponse = {
        id: 'tx-123',
        anchorTxId: 'anchor-tx-123',
        interactiveUrl: 'https://example.com/interactive',
        status: 'incomplete',
        startedAt: new Date(),
      };
      service.initiate.mockResolvedValue(mockResponse);

      const result = await controller.initiate(dto, mockReq);

      expect(service.initiate).toHaveBeenCalledWith(dto, mockUserId);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getStatus', () => {
    it('passes authenticated user id from req.user.sub to service.getStatus', async () => {
      const mockResponse = {
        id: 'tx-123',
        anchorTxId: 'anchor-tx-123',
        status: 'incomplete',
        startedAt: new Date(),
      };
      service.getStatus.mockResolvedValue(mockResponse);

      const result = await controller.getStatus({ id: 'tx-123' }, mockReq);

      expect(service.getStatus).toHaveBeenCalledWith('tx-123', mockUserId);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getTransaction', () => {
    it('passes param id and authenticated user id to service.getStatus', async () => {
      const mockResponse = {
        id: 'tx-123',
        anchorTxId: 'anchor-tx-123',
        status: 'incomplete',
        startedAt: new Date(),
      };
      service.getStatus.mockResolvedValue(mockResponse);

      const result = await controller.getTransaction('tx-123', mockReq);

      expect(service.getStatus).toHaveBeenCalledWith('tx-123', mockUserId);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getHistory', () => {
    it('passes query and user id to service.getHistory', async () => {
      const query = { page: 1, limit: 10 };
      const mockResponse = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
      };
      service.getHistory.mockResolvedValue(mockResponse);

      const result = await controller.getHistory(query, mockReq);

      expect(service.getHistory).toHaveBeenCalledWith(mockUserId, query);
      expect(result).toEqual(mockResponse);
    });
  });
});
