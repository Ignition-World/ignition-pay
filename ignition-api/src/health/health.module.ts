import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { QueueHealthIndicator } from './queue.health';
import { QueueModule } from '../queue/queue.module';
import { parsePositiveInt } from '../prisma/prisma.service';
import {
  DEFAULT_FAILURE_THRESHOLD,
  DependencyHealthRegistry,
} from './health-probe';

@Module({
  imports: [
    TerminusModule,
    // Registers the five queues the queue health indicator probes. QueueModule
    // is a plain (non-global) module, but Nest keeps a single instance per
    // module reference, so this re-uses the same queues as the rest of the app.
    QueueModule,
  ],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    QueueHealthIndicator,
    {
      // Consecutive failures tolerated before a dependency is marked down.
      // Set HEALTH_FAILURE_THRESHOLD=1 to fail on the first failed probe.
      provide: DependencyHealthRegistry,
      useFactory: (config: ConfigService) =>
        new DependencyHealthRegistry(
          parsePositiveInt(
            config.get<string>('HEALTH_FAILURE_THRESHOLD'),
            DEFAULT_FAILURE_THRESHOLD,
          ),
        ),
      inject: [ConfigService],
    },
  ],
})
export class HealthModule {}
