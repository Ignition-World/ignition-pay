import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractEventsProcessor } from './contract-events.processor';
import { CONTRACT_EVENT_JOB_PROCESS } from '../queue.jobs';

describe('ContractEventsProcessor', () => {
  let processor: ContractEventsProcessor;
  let prisma: { transaction: { updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    processor = new ContractEventsProcessor(prisma as unknown as PrismaService);
  });

  it('updates matching transactions when txHash is present', async () => {
    const job = {
      id: 'job-1',
      name: CONTRACT_EVENT_JOB_PROCESS,
      data: {
        contractId: 'contract-1',
        eventType: 'payment_received',
        txHash: 'abc123hash',
        ledger: 12345,
        data: { amount: '10' },
      },
    } as Job;

    await processor.handleEvent(job);

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { stellarTxHash: 'abc123hash' },
      data: {
        status: 'COMPLETED',
        statusUpdatedAt: expect.any(Date) as Date,
        metadata: { amount: '10' },
      },
    });
  });

  it('rejects jobs missing contractId or eventType', async () => {
    const job = {
      id: 'job-2',
      name: CONTRACT_EVENT_JOB_PROCESS,
      data: { contractId: '', eventType: 'payment_received' },
    } as Job;

    await expect(processor.handleEvent(job)).rejects.toThrow(
      'Missing required contract event fields',
    );
  });
});
