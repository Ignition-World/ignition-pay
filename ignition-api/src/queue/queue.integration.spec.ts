import { BullModule, getQueueToken } from '@nestjs/bull';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUEUE_ANALYTICS,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_EMAIL,
} from './queue.constants';
import {
  ANALYTICS_JOB_TRACK,
  CONTRACT_EVENT_JOB_PROCESS,
  EMAIL_JOB_SEND_VERIFICATION,
} from './queue.jobs';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { ContractEventsProcessor } from './processors/contract-events.processor';
import { EmailProcessor } from './processors/email.processor';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('Queue processors integration', () => {
  let moduleRef: TestingModule;
  let emailQueue: Queue;
  let contractEventsQueue: Queue;
  let analyticsQueue: Queue;
  let prisma: {
    transaction: { updateMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  beforeAll(async () => {
    prisma = {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({ redis: REDIS_URL }),
        BullModule.registerQueue(
          { name: QUEUE_EMAIL },
          { name: QUEUE_CONTRACT_EVENTS },
          { name: QUEUE_ANALYTICS },
        ),
      ],
      providers: [
        EmailProcessor,
        ContractEventsProcessor,
        AnalyticsProcessor,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    await moduleRef.init();

    emailQueue = moduleRef.get<Queue>(getQueueToken(QUEUE_EMAIL));
    contractEventsQueue = moduleRef.get<Queue>(
      getQueueToken(QUEUE_CONTRACT_EVENTS),
    );
    analyticsQueue = moduleRef.get<Queue>(getQueueToken(QUEUE_ANALYTICS));

    // Mock queue operations to avoid requiring a running Redis instance
    emailQueue.add = jest.fn().mockImplementation(async (name, data) => {
      const processor = moduleRef.get(EmailProcessor);
      if (name === EMAIL_JOB_SEND_VERIFICATION) {
        await processor.handleVerification({ data } as any);
      } else {
        await processor.handleNotification({ data } as any);
      }
      return { finished: jest.fn().mockResolvedValue(undefined) };
    });

    contractEventsQueue.add = jest
      .fn()
      .mockImplementation(async (name, data) => {
        const processor = moduleRef.get(ContractEventsProcessor);
        await processor.handleEvent({ data } as any);
        return { finished: jest.fn().mockResolvedValue(undefined) };
      });

    analyticsQueue.add = jest.fn().mockImplementation(async (name, data) => {
      const processor = moduleRef.get(AnalyticsProcessor);
      await processor.trackEvent({ data } as any);
      return { finished: jest.fn().mockResolvedValue(undefined) };
    });

    emailQueue.close = jest.fn().mockResolvedValue(undefined);
    contractEventsQueue.close = jest.fn().mockResolvedValue(undefined);
    analyticsQueue.close = jest.fn().mockResolvedValue(undefined);
  }, 30000);

  afterAll(async () => {
    await emailQueue?.close();
    await contractEventsQueue?.close();
    await analyticsQueue?.close();
    await moduleRef?.close();
  });

  it('processes email verification jobs', async () => {
    const job = await emailQueue.add(EMAIL_JOB_SEND_VERIFICATION, {
      to: 'integration@example.com',
      token: 'verify-token',
      userId: 'user-integration',
    });

    await job.finished();
  }, 15000);

  it('processes contract event jobs', async () => {
    const job = await contractEventsQueue.add(CONTRACT_EVENT_JOB_PROCESS, {
      contractId: 'contract-integration',
      eventType: 'payment_received',
      txHash: 'integration-tx-hash',
    });

    await job.finished();

    expect(prisma.transaction.updateMany).toHaveBeenCalled();
  }, 15000);

  it('processes analytics jobs', async () => {
    const job = await analyticsQueue.add(ANALYTICS_JOB_TRACK, {
      event: 'integration_test',
      userId: 'user-integration',
      properties: { source: 'jest' },
    });

    await job.finished();

    expect(prisma.auditLog.create).toHaveBeenCalled();
  }, 15000);
});
