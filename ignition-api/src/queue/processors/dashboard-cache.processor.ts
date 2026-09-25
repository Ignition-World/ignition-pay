import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

import { UsersService } from '../../users/users.service';
import { DashboardCacheService } from '../../users/dashboard-cache.service';
import { QUEUE_DASHBOARD } from '../queue.constants';
import {
  DASHBOARD_JOB_INVALIDATE,
  DASHBOARD_JOB_WARM,
  DashboardInvalidatePayload,
  DashboardWarmPayload,
} from '../queue.jobs';

/**
 * Issue #591 — Dashboard cache warming.
 *
 * Pre-computes and caches the aggregated dashboard payload (balances +
 * recent transactions) for a user so the first dashboard load is served
 * from Redis instead of hitting the database.
 */
@Processor(QUEUE_DASHBOARD)
export class DashboardCacheProcessor {
  private readonly logger = new Logger(DashboardCacheProcessor.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly dashboardCache: DashboardCacheService,
  ) {}

  @Process(DASHBOARD_JOB_WARM)
  async warm(job: Job<DashboardWarmPayload>): Promise<void> {
    const { userId } = job.data;

    if (!userId) {
      throw new Error('Missing required userId for dashboard warm job');
    }

    const dashboard = await this.usersService.computeDashboard(userId);
    await this.dashboardCache.set(userId, dashboard);

    this.logger.debug(
      JSON.stringify({
        queue: QUEUE_DASHBOARD,
        jobId: job.id,
        jobName: DASHBOARD_JOB_WARM,
        userId,
      }),
    );
  }

  @Process(DASHBOARD_JOB_INVALIDATE)
  async invalidate(job: Job<DashboardInvalidatePayload>): Promise<void> {
    const { userId } = job.data;

    if (!userId) {
      throw new Error('Missing required userId for dashboard invalidate job');
    }

    await this.dashboardCache.invalidate(userId);

    this.logger.debug(
      JSON.stringify({
        queue: QUEUE_DASHBOARD,
        jobId: job.id,
        jobName: DASHBOARD_JOB_INVALIDATE,
        userId,
      }),
    );
  }
}
