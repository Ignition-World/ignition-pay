import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { QueryMetricsService } from './query-metrics.service';

@Global()
@Module({
  providers: [PrismaService, QueryMetricsService],
  exports: [PrismaService, QueryMetricsService],
})
export class PrismaModule {}
