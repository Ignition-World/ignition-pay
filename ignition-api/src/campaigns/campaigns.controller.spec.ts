import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { BrowseCampaignsQueryDto } from './dto/browse-campaigns.dto';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';

const allowAllGuard = { canActivate: (_ctx: ExecutionContext) => true };

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let service: jest.Mocked<
    Pick<
      CampaignsService,
      'createCampaign' | 'updateCampaign' | 'browseCampaigns'
    >
  >;
  let mockCache: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    service = {
      createCampaign: jest.fn(),
      updateCampaign: jest.fn(),
      browseCampaigns: jest.fn(),
    };

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [
        { provide: CampaignsService, useValue: service },
        { provide: CACHE_MANAGER, useValue: mockCache },
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

    controller = module.get<CampaignsController>(CampaignsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call campaignsService.createCampaign', async () => {
      const req = { user: { sub: 'user-123' } } as any;
      const dto: CreateCampaignDto = {
        title: 'Save the Trees',
        description: 'Saving trees in the forest',
        goalAmount: '5000',
        endDate: '2026-12-31T23:59:59Z',
        category: 'ENVIRONMENT',
        walletNetwork: 'STELLAR' as any,
        milestones: [],
      };
      service.createCampaign.mockResolvedValue({
        id: 'camp-123',
        ...dto,
      } as any);

      const res = await controller.create(dto, req);

      expect(service.createCampaign).toHaveBeenCalledWith('user-123', dto);
      expect(res).toEqual({ id: 'camp-123', ...dto });
    });
  });

  describe('update', () => {
    it('should call campaignsService.updateCampaign', async () => {
      const req = { user: { sub: 'user-123' } } as any;
      const dto: UpdateCampaignDto = {
        title: 'New Title',
      };
      service.updateCampaign.mockResolvedValue({
        id: 'camp-123',
        title: 'New Title',
      } as any);

      const res = await controller.update('camp-123', dto, req);

      expect(service.updateCampaign).toHaveBeenCalledWith(
        'user-123',
        'camp-123',
        dto,
      );
      expect(res).toEqual({ id: 'camp-123', title: 'New Title' });
    });

    it('should throw BadRequestException if update contains forbidden fields', async () => {
      const req = { user: { sub: 'user-123' } } as any;
      const dto: UpdateCampaignDto = {
        goalAmount: '6000', // Forbidden
      } as any;

      await expect(controller.update('camp-123', dto, req)).rejects.toThrow(
        new BadRequestException('Cannot update protected fields: goalAmount'),
      );
    });
  });

  describe('browseCampaigns', () => {
    it('should return cached value if present', async () => {
      const query: BrowseCampaignsQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
      };
      const cachedResult = {
        data: [{ id: 'camp-123' }],
        meta: { total: 1, page: 1, limit: 10, pages: 1 },
      };
      mockCache.get.mockResolvedValue(cachedResult);

      const res = await controller.browseCampaigns(query);

      expect(mockCache.get).toHaveBeenCalledWith(
        'campaigns:page:1:limit:10:sortBy:createdAt',
      );
      expect(service.browseCampaigns).not.toHaveBeenCalled();
      expect(res).toEqual(cachedResult);
    });

    it('should fetch from service and cache result if not cached', async () => {
      const query: BrowseCampaignsQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        category: 'ENVIRONMENT',
        status: 'ACTIVE',
        search: 'forest',
      };
      const serviceResult = {
        data: [{ id: 'camp-123' }],
        meta: { total: 1, page: 1, limit: 10, pages: 1 },
      };
      mockCache.get.mockResolvedValue(null);
      service.browseCampaigns.mockResolvedValue(serviceResult);

      const res = await controller.browseCampaigns(query);

      const expectedCacheKey =
        'campaigns:page:1:limit:10:sortBy:createdAt:category:ENVIRONMENT:status:ACTIVE:search:forest';
      expect(mockCache.get).toHaveBeenCalledWith(expectedCacheKey);
      expect(service.browseCampaigns).toHaveBeenCalledWith(query);
      expect(mockCache.set).toHaveBeenCalledWith(
        expectedCacheKey,
        serviceResult,
        30000,
      );
      expect(res).toEqual(serviceResult);
    });
  });
});
