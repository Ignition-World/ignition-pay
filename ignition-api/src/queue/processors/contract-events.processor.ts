import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_CONTRACT_EVENTS } from '../queue.constants';
import {
  CONTRACT_EVENT_JOB_PROCESS,
  ContractEventPayload,
} from '../queue.jobs';

@Processor(QUEUE_CONTRACT_EVENTS)
export class ContractEventsProcessor {
  private readonly logger = new Logger(ContractEventsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process(CONTRACT_EVENT_JOB_PROCESS)
  async handleEvent(job: Job<ContractEventPayload>): Promise<void> {
    const { contractId, eventType, txHash, ledger, data } = job.data;

    if (!contractId || !eventType) {
      throw new Error('Missing required contract event fields');
    }

    this.logger.log(
      JSON.stringify({
        queue: QUEUE_CONTRACT_EVENTS,
        jobId: job.id,
        jobName: CONTRACT_EVENT_JOB_PROCESS,
        contractId,
        eventType,
        txHash,
        ledger,
      }),
    );

    if (txHash) {
      const updateData: any = {
        status: 'COMPLETED',
        statusUpdatedAt: new Date(),
      };

      if (data) {
        updateData.metadata = data;
      }

      const result = await this.prisma.transaction.updateMany({
        where: { stellarTxHash: txHash },
        data: updateData,
      });

      if (result.count > 0) {
        this.logger.debug(
          `Updated ${result.count} transaction(s) for txHash ${txHash}`,
        );
      }
    }
  }
}
