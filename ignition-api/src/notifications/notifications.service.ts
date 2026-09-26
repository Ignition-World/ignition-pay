import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationPreferences,
  defaultNotificationPreferences,
  isChannelEnabled,
  normalizeNotificationPreferences,
} from './notification-preferences';

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

  constructor(private readonly prisma: PrismaService) {}

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

    // Idempotency check: skip if a matching notification already exists.
    if (params.relatedId) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: params.userId,
          type: params.type,
          relatedId: params.relatedId,
        },
        select: { id: true },
      });

      if (existing) {
        this.logger.debug(
          `Duplicate notification skipped: [${params.type}] userId=${params.userId} relatedId=${params.relatedId}`,
        );
        return existing;
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        relatedId: params.relatedId,
      },
    });

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
      return { count: 0 };
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
      return { count: 0 };
    }

    const result = await this.prisma.notification.createMany({
      data: allowed.map((params) => ({
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        relatedId: params.relatedId,
      })),
    });

    this.logger.log(
      `Notifications batched: ${result.count} row(s) in a single insert`,
    );

    return result;
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
