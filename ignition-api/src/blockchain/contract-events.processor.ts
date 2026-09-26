import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

@Processor('contract-events')
export class ContractEventsProcessor {
  private readonly logger = new Logger(ContractEventsProcessor.name);
  private readonly CHECKPOINT_KEY = 'blockchain:contract-events:checkpoint';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  @Process('process-batch')
  async handleEventBatch(job: Job<{ events: any[]; ledgerSequence: number }>) {
    const { events, ledgerSequence } = job.data;

    // 1. Retrieve current persisted checkpoint
    const currentCheckpointStr = await this.redis.get(this.CHECKPOINT_KEY);
    const currentCheckpoint = currentCheckpointStr ? parseInt(currentCheckpointStr, 10) : 0;

    // 2. Skip batches that have already been processed (prevent backward reprocessing)
    if (ledgerSequence <= currentCheckpoint) {
      this.logger.warn(`Skipping stale event batch at ledger ${ledgerSequence} (Checkpoint: ${currentCheckpoint})`);
      return;
    }

    try {
      // 3. Process contract events and side effects transactionally
      await this.processEvents(events);

      // 4. Atomically update the persistent checkpoint after successful processing
      await this.redis.set(this.CHECKPOINT_KEY, ledgerSequence.toString());
      this.logger.verbose(`Successfully updated contract events checkpoint to ledger ${ledgerSequence}`);
    } catch (error) {
      this.logger.error(`Failed processing contract events at ledger ${ledgerSequence}: ${error.message}`);
      throw error; // Retain job in queue for retry without advancing checkpoint
    }
  }

  private async processEvents(events: any[]): Promise<void> {
    // Event execution logic mapping contract events to downstream business actions
  }
}