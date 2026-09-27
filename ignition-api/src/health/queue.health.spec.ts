import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { getQueueToken } from '@nestjs/bull';
import { QueueHealthIndicator } from './queue.health';
import {
  QUEUE_ANALYTICS,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_EMAIL,
  QUEUE_HORIZON,
  QUEUE_PAYMENTS,
} from '../queue/queue.constants';

const QUEUE_NAMES = [
  QUEUE_EMAIL,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_ANALYTICS,
  QUEUE_PAYMENTS,
  QUEUE_HORIZON,
];

function jobCounts(overrides: Record<string, number> = {}) {
  return {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    ...overrides,
  };
}

describe('QueueHealthIndicator', () => {
  let indicator: QueueHealthIndicator;
  let queues: Record<string, { getJobCounts: jest.Mock }>;

  beforeEach(async () => {
    queues = {};
    const providers = QUEUE_NAMES.map((name) => {
      const queue = { getJobCounts: jest.fn().mockResolvedValue(jobCounts()) };
      queues[name] = queue;
      return { provide: getQueueToken(name), useValue: queue };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueHealthIndicator, ...providers],
    }).compile();

    indicator = module.get<QueueHealthIndicator>(QueueHealthIndicator);
  });

  it('reports every registered queue as up when they all answer', async () => {
    const result = await indicator.isHealthy();

    expect(result).toEqual({
      queue: {
        status: 'up',
        [QUEUE_EMAIL]: { status: 'up', ...jobCounts() },
        [QUEUE_CONTRACT_EVENTS]: { status: 'up', ...jobCounts() },
        [QUEUE_ANALYTICS]: { status: 'up', ...jobCounts() },
        [QUEUE_PAYMENTS]: { status: 'up', ...jobCounts() },
        [QUEUE_HORIZON]: { status: 'up', ...jobCounts() },
      },
    });
  });

  it('surfaces per-queue backlog', async () => {
    queues[QUEUE_EMAIL].getJobCounts.mockResolvedValue(
      jobCounts({ waiting: 12, active: 3, failed: 2 }),
    );

    const result: any = await indicator.isHealthy();

    expect(result.queue[QUEUE_EMAIL]).toMatchObject({
      status: 'up',
      waiting: 12,
      active: 3,
      failed: 2,
    });
  });

  it('probes all five queues', async () => {
    await indicator.isHealthy();

    for (const name of QUEUE_NAMES) {
      expect(queues[name].getJobCounts).toHaveBeenCalledTimes(1);
    }
  });

  it('throws HealthCheckError when a queue cannot be reached', async () => {
    queues[QUEUE_PAYMENTS].getJobCounts.mockRejectedValue(
      new Error('READONLY You cannot write against a read only replica'),
    );

    await expect(indicator.isHealthy()).rejects.toThrow(HealthCheckError);
  });

  it('names the failing queues and keeps the healthy ones in the payload', async () => {
    queues[QUEUE_HORIZON].getJobCounts.mockRejectedValue(new Error('timeout'));

    const error: any = await indicator.isHealthy().catch((err) => err);

    expect(error.message).toContain(QUEUE_HORIZON);
    expect(error.causes.queue[QUEUE_HORIZON]).toMatchObject({
      status: 'down',
      error: 'timeout',
    });
    expect(error.causes.queue[QUEUE_EMAIL]).toMatchObject({ status: 'up' });
  });

  it('reports every failing queue, not just the first', async () => {
    queues[QUEUE_EMAIL].getJobCounts.mockRejectedValue(new Error('down'));
    queues[QUEUE_ANALYTICS].getJobCounts.mockRejectedValue(new Error('down'));

    const error: any = await indicator.isHealthy().catch((err) => err);

    expect(error.message).toContain(QUEUE_EMAIL);
    expect(error.message).toContain(QUEUE_ANALYTICS);
    expect(error.message).not.toContain(QUEUE_PAYMENTS);
  });

  it('honours a custom health result key', async () => {
    const result = await indicator.isHealthy('bull');

    expect(result).toHaveProperty('bull');
  });
});
