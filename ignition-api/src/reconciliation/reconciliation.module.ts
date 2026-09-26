import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { BalanceReconciliationService } from './balance-reconciliation.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    QueueModule,
  ],
  providers: [BalanceReconciliationService],
  exports: [BalanceReconciliationService],
})
export class ReconciliationModule {}
