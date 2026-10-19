import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import Keyv from 'keyv';

import { UserDashboardDto } from './dto/dashboard.dto';

/**
 * Issue #591 — Dashboard cache warming.
 *
 * Centralises the cache key scheme and TTL used by both the on-demand
 * dashboard read path (`UsersService.getDashboard`) and the scheduled
 * Bull warming job (`DashboardCacheProcessor`).
 *
 * TTL is 6 minutes: the warmer runs every 5 minutes, leaving a 1 minute
 * buffer so a cached entry never expires before the next warm cycle.
 */
export const DASHBOARD_CACHE_TTL_MS = 6 * 60 * 1000;

/** Interval between scheduled warming sweeps (5 minutes). */
export const DASHBOARD_WARM_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum number of users warmed per sweep to bound Redis memory usage. */
export const DASHBOARD_WARM_BATCH_SIZE = 500;

export function dashboardCacheKey(userId: string): string {
  return `dashboard:${userId}`;
}

@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Keyv) {}

  /** Read a cached dashboard payload, or `undefined` on a cache miss. */
  async get(userId: string): Promise<UserDashboardDto | undefined> {
    try {
      return (await this.cache.get<UserDashboardDto>(
        dashboardCacheKey(userId),
      )) as UserDashboardDto | undefined;
    } catch (err: any) {
      // A cache read failure must never take down the dashboard endpoint.
      this.logger.warn(
        `Dashboard cache read failed for user ${userId}: ${err?.message ?? err}`,
      );
      return undefined;
    }
  }

  /** Store a dashboard payload with the 6 minute TTL. */
  async set(userId: string, dashboard: UserDashboardDto): Promise<void> {
    try {
      await this.cache.set(
        dashboardCacheKey(userId),
        dashboard,
        DASHBOARD_CACHE_TTL_MS,
      );
    } catch (err: any) {
      this.logger.warn(
        `Dashboard cache write failed for user ${userId}: ${err?.message ?? err}`,
      );
    }
  }

  /** Invalidate a cached dashboard payload (e.g. on a significant event). */
  async invalidate(userId: string): Promise<void> {
    try {
      await this.cache.delete(dashboardCacheKey(userId));
    } catch (err: any) {
      this.logger.warn(
        `Dashboard cache invalidation failed for user ${userId}: ${err?.message ?? err}`,
      );
    }
  }
}
