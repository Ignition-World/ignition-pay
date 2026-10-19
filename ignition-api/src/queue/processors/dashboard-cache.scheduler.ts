import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_DASHBOARD } from '../queue.constants';
import {
  DASHBOARD_JOB_WARM,
  DashboardWarmPayload,
} from '../queue.jobs';
import {
  DASHBOARD_WARM_BATCH_SIZE,
  DASHBOARD_WARM_INTERVAL_MS,
} from '../../users/dashboard-cache.service';

/**
 * Issue #591 — Dashboard cache warming.
 *
 * Registers a repeatable Bull job that runs every 5 minutes and enqueues a
 * warm job for each active user, so their aggregated dashboard payload is
 * pre-computed and cached before the next request.
 *
 * The sweep is bounded by DASHBOARD_WARM_BATCH_SIZE to keep Redis memory
 * usage within configured limits.
 */
@Injectable()
export class DashboardCacheScheduler implements OnModuleInit {
  private readonly logger = new Logger(DashboardCacheScheduler.name);
  private readonly intervalMs: number;
  private readonly batchSize: number;

  constructor(
    @InjectQueue(QUEUE_DASHBOARD) private readonly dashboardQueue: Queue,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(
      config.get<number>('DASHBOARD_WARM_INTERVAL_MS') ??
        DASHBOARD_WARM_INTERVAL_MS,
    );
    this.batchSize = Number(
      config.get<number>('DASHBOARD_WARM_BATCH_SIZE') ??
        DASHBOARD_WARM_BATCH_SIZE,
    );
  }

  async onModuleInit(): Promise<void> {
    // Register the repeatable sweep. Bull deduplicates repeatable jobs by
    // key, so restarting the app does not stack duplicate schedules.
    await this.dashboardQueue.add(
      DASHBOARD_JOB_WARM,
      {},
      {
        repeat: { every: this.intervalMs },
        jobId: 'dashboard-warm-sweep',
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Dashboard cache warming scheduled every ${this.intervalMs}ms`,
    );
  }

  /**
   * Enqueues a warm job for each active user. Exposed for tests and for
   * manual/administrative triggering.
   */
  async enqueueActiveUsers(): Promise<number> {
    try {
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
        take: this.batchSize,
      });

      if (users.length === 0) return 0;

      for (const user of users) {
        const payload: DashboardWarmPayload = { userId: user.id };
        await this.dashboardQueue.add(DASHBOARD_JOB_WARM, payload, {
          jobId: `dashboard-warm-${user.id}`,
          removeOnComplete: true,
          removeOnFail: false,
        });
      }

      this.logger.debug(
        `Enqueued dashboard warm jobs for ${users.length} user(s).`,
      );
      return users.length;
    } catch (err: any) {
      this.logger.error(
        `Failed to enqueue dashboard warm jobs: ${err?.message ?? err}`,
      );
      return 0;
    }
  }
}
