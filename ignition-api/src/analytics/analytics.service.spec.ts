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

  describe('streamExport (Issue #805)', () => {
    it('sets chunked headers and streams batches directly without buffering all in memory', async () => {
      const mockAuditLogs = [
        { id: '1', resourceType: 'Analytics', resourceId: 'event_1', metadata: {} },
        { id: '2', resourceType: 'Analytics', resourceId: 'event_2', metadata: {} },
      ];

      const prismaMock = {
        auditLog: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce(mockAuditLogs)
            .mockResolvedValueOnce([]),
        },
      };

      const streamingService = new AnalyticsService(prismaMock as any);

      const headers: Record<string, string> = {};
      const chunks: string[] = [];
      let ended = false;

      const res = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        write: (chunk: string) => {
          chunks.push(chunk);
          return true;
        },
        end: () => {
          ended = true;
        },
      };

      await streamingService.streamExport(res, { userId: 'user-1', batchSize: 2 });

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Transfer-Encoding']).toBe('chunked');
      expect(chunks[0]).toBe('[\n');
      expect(chunks.some((c) => c.includes('event_1'))).toBe(true);
      expect(chunks.some((c) => c.includes('event_2'))).toBe(true);
      expect(chunks[chunks.length - 1]).toBe('\n]');
      expect(ended).toBe(true);
      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          where: expect.objectContaining({
            resourceType: 'Analytics',
            userId: 'user-1',
          }),
        }),
      );
    });
  });
});
