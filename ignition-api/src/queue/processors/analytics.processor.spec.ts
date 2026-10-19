import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsProcessor } from './analytics.processor';
import { ANALYTICS_JOB_TRACK } from '../queue.jobs';

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    processor = new AnalyticsProcessor(prisma as unknown as PrismaService);
  });

  it('persists analytics events to the audit log', async () => {
    const job = {
      id: 'job-1',
      name: ANALYTICS_JOB_TRACK,
      data: {
        event: 'page_view',
        userId: 'user-1',
        properties: { path: '/dashboard' },
      },
    } as Job;

    await processor.trackEvent(job);

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'ADMIN_ACTION',
        resourceType: 'Analytics',
        resourceId: 'page_view',
        details: JSON.stringify({
          event: 'page_view',
          properties: { path: '/dashboard' },
        }),
      },
    });
  });

  it('rejects jobs without an event name', async () => {
    const job = {
      id: 'job-2',
      name: ANALYTICS_JOB_TRACK,
      data: { event: '' },
    } as Job;

    await expect(processor.trackEvent(job)).rejects.toThrow(
      'Missing required analytics event name',
    );
  });
});
