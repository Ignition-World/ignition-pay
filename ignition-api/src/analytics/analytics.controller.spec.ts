import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: jest.Mocked<Pick<AnalyticsService, 'streamExport'>>;

  beforeEach(async () => {
    service = {
      streamExport: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('exportAnalytics() delegates to streamExport', async () => {
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() } as any;
    await controller.exportAnalytics(res, 'user-1');

    expect(service.streamExport).toHaveBeenCalledWith(res, { userId: 'user-1' });
  });

  it('downloadAnalytics() delegates to streamExport', async () => {
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() } as any;
    await controller.downloadAnalytics(res, undefined);

    expect(service.streamExport).toHaveBeenCalledWith(res, { userId: undefined });
  });
});
