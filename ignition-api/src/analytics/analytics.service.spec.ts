import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import * as Sentry from '@sentry/node';

jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('track() should log and add Sentry breadcrumb', () => {
    const event = {
      name: 'test_event',
      userId: 'user-1',
      properties: { key: 'value' },
    };
    service.track(event);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      message: 'test_event',
      data: { userId: 'user-1', key: 'value' },
      level: 'info',
    });
  });

  it('identify() should set Sentry user and log', () => {
    service.identify('user-1', { email: 'user@example.com' });

    expect(Sentry.setUser).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'user@example.com',
    });
  });
});
