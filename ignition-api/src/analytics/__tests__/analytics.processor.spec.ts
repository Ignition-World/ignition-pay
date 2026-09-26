import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsProcessor } from '../analytics.processor';
import { getRedisToken } from '@liaoliaots/nestjs-redis';
import { Job } from 'bull';

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;
  let mockRedis: {
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockRedis = {
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsProcessor,
        {
          provide: getRedisToken('default'),
          useValue: mockRedis,
        },
      ],
    }).compile();

    processor = module.get<AnalyticsProcessor>(AnalyticsProcessor.name);
  });

  it('should process unique analytics event successfully when lock is acquired', async () => {
    // Simulate successful Redis SET NX lock acquisition (returns 'OK')
    mockRedis.set.mockResolvedValue('OK');

    // Spy on internal aggregator method
    const aggregateSpy = jest.spyOn(processor as any, 'applyMetricAggregate').mockResolvedValue(undefined);

    const job = {
      id: 'job-101',
      data: { eventId: 'evt-unique-123', metricKey: 'api_requests', value: 1 },
    } as unknown as Job;

    await processor.handleAnalyticsEvent(job);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'analytics:processed:evt-unique-123',
      'locked',
      'EX',
      86400,
      'NX',
    );
    expect(aggregateSpy).toHaveBeenCalledWith('api_requests', 1);
  });

  it('should skip processing when duplicate eventId is detected (lock fails)', async () => {
    // Simulate Redis SET NX lock rejection (returns null because key exists)
    mockRedis.set.mockResolvedValue(null);

    const aggregateSpy = jest.spyOn(processor as any, 'applyMetricAggregate').mockResolvedValue(undefined);

    const job = {
      id: 'job-102',
      data: { eventId: 'evt-duplicate-456', metricKey: 'api_requests', value: 1 },
    } as unknown as Job;

    await processor.handleAnalyticsEvent(job);

    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    expect(aggregateSpy).not.toHaveBeenCalled();
  });
});