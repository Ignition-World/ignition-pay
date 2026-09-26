import { Controller, Delete, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionGuard } from '../session/session.guard';
import { AdminGuard } from '../users/guards/admin.guard';
import {
  NotificationDedupStore,
  type DedupEntry,
} from './notification-dedup.store';

export interface DedupCacheView {
  /** Deduplication window in milliseconds. */
  windowMs: number;
  /** Number of entries returned. */
  count: number;
  entries: DedupEntry[];
}

/**
 * Issue #623 — admin view over the notification deduplication cache.
 *
 * Deduplication is invisible by design: a suppressed notification leaves no trace
 * in the notifications table, so without this a support question of the form "why
 * did this user not get an alert?" has no answer. Listing the live keys with their
 * remaining TTL turns that into a lookup, and clearing lets an operator release a
 * window that is suppressing something it should not.
 *
 * Keys are hashed, so this exposes which windows are open and for how long, not
 * who they belong to.
 */
@ApiTags('admin')
@Controller('admin/notifications/dedup')
@UseGuards(SessionGuard, AdminGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationDedupController {
  constructor(private readonly dedup: NotificationDedupStore) {}

  /**
   * GET /admin/notifications/dedup
   *
   * @param limit - Maximum entries to return; defaults to 100.
   * @returns The configured window and the live deduplication keys.
   */
  @Get()
  @ApiOperation({ summary: 'View the notification deduplication cache (admin only)' })
  @ApiResponse({ status: 200, description: 'Deduplication cache listed' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async view(@Query('limit') limit?: string): Promise<DedupCacheView> {
    const parsed = Number(limit);
    const effectiveLimit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 100;

    const entries = await this.dedup.entries(effectiveLimit);

    return {
      windowMs: this.dedup.windowMs,
      count: entries.length,
      entries,
    };
  }

  /**
   * DELETE /admin/notifications/dedup
   *
   * Clears every deduplication key for this environment. Notifications suppressed
   * before the clear are not replayed — this only stops future events being
   * collapsed against the windows that were open.
   *
   * @returns How many keys were removed.
   */
  @Delete()
  @ApiOperation({ summary: 'Clear the notification deduplication cache (admin only)' })
  @ApiResponse({ status: 200, description: 'Deduplication cache cleared' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  async clear(): Promise<{ cleared: number }> {
    return { cleared: await this.dedup.clear() };
  }
}
