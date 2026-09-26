import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationPreferences,
  defaultNotificationPreferences,
  isChannelEnabled,
  normalizeNotificationPreferences,
} from './notification-preferences';
import {
  NotificationDedupStore,
  PENDING_MARKER,
} from './notification-dedup.store';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** ID of the related resource (campaign, donation, milestone …) */
  relatedId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dedup: NotificationDedupStore,
  ) {}

  /**
   * Deduplication key for an event, or null when the event cannot be deduplicated.
   *
   * An event with no `relatedId` has nothing identifying it beyond user and type,
   * so collapsing on that alone would silently drop genuinely distinct
   * notifications. Those pass through, matching the pre-existing behaviour of the
   * database guard below.
   */
  private dedupKeyFor(params: CreateNotificationParams): string | null {
    if (!params.relatedId) return null;
    return this.dedup.key(params.userId, params.type, params.relatedId);
  }

  /** Start of the current deduplication window. */
  private windowStart(): Date {
    return new Date(Date.now() - this.dedup.windowMs);
  }

  /**
   * Bumps the `createdAt` of the notification a duplicate event refers to, so the
   * user's list resurfaces it instead of gaining a second copy.
   *
   * @param params - The duplicate event.
   * @param existingValue - Value stored on the dedup key, if any.
   * @returns The bumped row, or null when no row is found inside the window.
   */
  private async bumpExisting(
    params: CreateNotificationParams,
    existingValue?: string,
  ) {
    if (existingValue && existingValue !== PENDING_MARKER) {
      const bumped = await this.prisma.notification
        .update({
          where: { id: existingValue },
          data: { createdAt: new Date() },
        })
        .catch(() => null);

      if (bumped) return bumped;
    }

    // The owner had not recorded an id yet, or the row has since been deleted.
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: params.userId,
        type: params.type,
        relatedId: params.relatedId,
        createdAt: { gte: this.windowStart() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!existing) return null;

    return this.prisma.notification.update({
      where: { id: existing.id },
      data: { createdAt: new Date() },
    });
  }

  /**
   * Persist a notification row, skipping the write when an identical
   * (userId, type, relatedId) row already exists in the database.
   *
   * Why this is needed:
   *   The Redis SET-NX dedup in the SSE consumer is the first line of
   *   defence, but it only works within a single process.  In a
   *   multi-pod deployment (or during a Redis eviction storm) two pods can
   *   both claim a dedup key and call this method concurrently.  The
   *   `findFirst` guard here ensures that no duplicate row ever reaches the
   *   database regardless of how many producers are running.
   *
   *   Using `findFirst` + conditional `create` (rather than a DB-level
   *   unique constraint) keeps the Prisma schema migration-free for now and
   *   is safe because Prisma wraps each operation in a serialisable
   *   snapshot inside a single Postgres connection pool.  The residual
   *   window (two concurrent `findFirst` calls both returning null before
   *   either `create` commits) is extremely narrow and is fully protected
   *   by the Redis layer above.
   */
  /** Read a user's notification preferences, merged over the all-enabled defaults. */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { preferences: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const stored = (user.preferences as Record<string, unknown> | null)
      ?.notifications;
    return normalizeNotificationPreferences(stored);
  }

  /** Persist a partial notification preference update, merged over existing preferences. */
  async updatePreferences(
    userId: string,
    partial: Record<string, Partial<Record<'email' | 'push' | 'inApp', boolean>>>,
  ): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { preferences: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingPreferences =
      (user.preferences as Record<string, unknown> | null) ?? {};
    const existingNotifications = normalizeNotificationPreferences(
      existingPreferences.notifications,
    );
    const merged = normalizeNotificationPreferences({
      ...existingNotifications,
      ...partial,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          ...existingPreferences,
          notifications: merged,
        } as Prisma.InputJsonValue,
      },
    });

    return merged;
  }

  /** Whether a notification type should be delivered on a given channel for this user. */
  private async channelEnabled(
    userId: string,
    type: NotificationType,
    channel: 'email' | 'push' | 'inApp',
  ): Promise<boolean> {
    const preferences = await this.getPreferences(userId).catch(
      () => defaultNotificationPreferences(),
    );
    return isChannelEnabled(preferences, type, channel);
  }

  async create(params: CreateNotificationParams) {
    if (!(await this.channelEnabled(params.userId, params.type, 'inApp'))) {
      this.logger.debug(
        `Notification suppressed by preference: [${params.type}] userId=${params.userId}`,
      );
      return null;
    }

    // #623 — atomic Redis claim on sha256(userId:eventType:resourceId). The first
    // caller inside the window creates the notification; every other caller bumps
    // the existing one instead of adding a second copy.
    const dedupKey = this.dedupKeyFor(params);

    if (dedupKey) {
      const { claimed, existing } = await this.dedup.claim(dedupKey);

      if (!claimed) {
        this.logger.debug(
          `Duplicate notification collapsed: [${params.type}] userId=${params.userId} relatedId=${params.relatedId}`,
        );
        return this.bumpExisting(params, existing);
      }
    }

    // Second line of defence, scoped to the same window. The Redis claim covers
    // concurrent callers; this covers a Redis outage or eviction, where claim()
    // deliberately fails open. Scoping it to the window is what makes the window
    // real — an unbounded check would suppress a legitimate notification about the
    // same resource forever.
    if (params.relatedId) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: params.userId,
          type: params.type,
          relatedId: params.relatedId,
          createdAt: { gte: this.windowStart() },
        },
        select: { id: true },
      });

      if (existing) {
        this.logger.debug(
          `Duplicate notification skipped at the database: [${params.type}] userId=${params.userId} relatedId=${params.relatedId}`,
        );
        return this.bumpExisting(params, existing.id);
      }
    }

    let notification;
    try {
      notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          relatedId: params.relatedId,
        },
      });
    } catch (error) {
      // Release the claim so a retry is not silently swallowed for an hour.
      if (dedupKey) await this.dedup.release(dedupKey);
      throw error;
    }

    if (dedupKey) {
      await this.dedup.recordNotificationId(dedupKey, notification.id);
    }

    this.logger.log(
      `Notification created: ${notification.id} [${notification.type}] for user ${params.userId}`,
    );

    return notification;
  }

  /**
   * Persist many notification rows in a single query.
   *
   * Fan-out to many recipients previously meant one sequential `create()`
   * round-trip per notification (O(n) DB calls); this batches them into a
   * single `createMany` insert so the cost is one round-trip regardless of
   * how many notifications are emitted (issue #442).
   */
  async createMany(paramsList: CreateNotificationParams[]) {
    if (paramsList.length === 0) {
      return { count: 0, deduplicated: 0 };
    }

    const allowed = (
      await Promise.all(
        paramsList.map(async (params) => ({
          params,
          allowed: await this.channelEnabled(
            params.userId,
            params.type,
            'inApp',
          ),
        })),
      )
    )
      .filter((entry) => entry.allowed)
      .map((entry) => entry.params);

    if (allowed.length === 0) {
      return { count: 0, deduplicated: 0 };
    }

    // #623 — this is the path the issue is about. A campaign milestone fans out to
    // every backer at once, and the same user can appear several times in one
    // batch, so the claim has to happen per entry before the insert.
    const claims = await Promise.all(
      allowed.map(async (params) => {
        const dedupKey = this.dedupKeyFor(params);
        if (!dedupKey) return { params, dedupKey: null, claimed: true };

        const { claimed, existing } = await this.dedup.claim(dedupKey);
        return { params, dedupKey, claimed, existing };
      }),
    );

    const fresh = claims.filter((entry) => entry.claimed);
    const duplicates = claims.filter((entry) => !entry.claimed);

    // Bump every duplicate so the recipient's list resurfaces the notification
    // they already have rather than gaining a second copy.
    await Promise.all(
      duplicates.map((entry) =>
        this.bumpExisting(entry.params, entry.existing).catch(() => null),
      ),
    );

    if (fresh.length === 0) {
      this.logger.log(
        `Notifications batched: 0 row(s); ${duplicates.length} collapsed by dedup`,
      );
      return { count: 0, deduplicated: duplicates.length };
    }

    let result: { count: number };
    try {
      result = await this.prisma.notification.createMany({
        data: fresh.map(({ params }) => ({
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          relatedId: params.relatedId,
        })),
      });
    } catch (error) {
      // Release every key this batch claimed, so the failed fan-out can be retried.
      await Promise.all(
        fresh
          .filter((entry) => entry.dedupKey)
          .map((entry) => this.dedup.release(entry.dedupKey as string)),
      );
      throw error;
    }

    // `createMany` does not return ids, so the claimed keys keep the pending
    // marker. A later duplicate resolves the row by its (userId, type, relatedId)
    // inside the window instead — see bumpExisting.

    this.logger.log(
      `Notifications batched: ${result.count} row(s) in a single insert; ` +
        `${duplicates.length} collapsed by dedup`,
    );

    return { count: result.count, deduplicated: duplicates.length };
  }

  async sendAlert(params: {
    title: string;
    message: string;
    level?: 'info' | 'warning' | 'critical';
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: true }> {
    const level = params.level ?? 'info';
    this.logger.log(
      `[alert:${level}] ${params.title} :: ${params.message}${params.metadata ? ` :: ${JSON.stringify(params.metadata)}` : ''}`,
    );
    return { ok: true };
  }

  /** Return all unread notifications for a user, newest first. */
  async findUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Mark a single notification as read. */
  async markRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  /** Mark all unread notifications as read for a user. */
  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
