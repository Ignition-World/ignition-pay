import { Module } from '@nestjs/common';
import { AnalyticsProcessor } from './analytics.processor';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [AnalyticsProcessor, AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
