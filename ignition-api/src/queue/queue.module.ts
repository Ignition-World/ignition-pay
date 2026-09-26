import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import {
  QUEUE_EMAIL,
  QUEUE_CONTRACT_EVENTS,
  QUEUE_ANALYTICS,
  QUEUE_PAYMENTS,
  QUEUE_HORIZON,
  QUEUE_DASHBOARD,
} from './queue.constants';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { ContractEventsProcessor } from './processors/contract-events.processor';
import { EmailProcessor } from './processors/email.processor';
import { PaymentProcessor } from './processors/payment.processor';
import { HorizonPollingProcessor } from './processors/horizon-polling.processor';
import { HorizonPollingScheduler } from './processors/horizon-polling.scheduler';
import { MilestoneProcessor } from './processors/milestone.processor';

const DEAD_LETTER_SETTINGS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false,
};

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        
        return {
          redis: {
            url: redisUrl,
            // Configure connection retry and backoff strategy during Redis blips
            retryStrategy: (times: number) => {
              const delay = Math.min(times * 100, 3000);
              return delay;
            },
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
          },
          defaultJobOptions: DEAD_LETTER_SETTINGS,
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_EMAIL },
      { name: QUEUE_CONTRACT_EVENTS },
      { name: QUEUE_ANALYTICS },
      { name: QUEUE_PAYMENTS },
      { name: QUEUE_HORIZON },
      { name: QUEUE_DASHBOARD },
    ),
    PrismaModule,
    ConfigModule,
  ],
  providers: [
    EmailProcessor,
    ContractEventsProcessor,
    AnalyticsProcessor,
    PaymentProcessor,
    HorizonPollingProcessor,
    HorizonPollingScheduler,
    MilestoneProcessor,
  ],
  exports: [BullModule],
})
export class QueueModule {}