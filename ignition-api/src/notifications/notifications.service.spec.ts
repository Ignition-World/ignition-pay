import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_DEDUP_WINDOW_MS,
  NotificationDedupStore,
  PENDING_MARKER,
} from './notification-dedup.store';

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findFirst: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

/**
 * In-memory stand-in for the Redis dedup store.
 *
 * Deliberately a working fake rather than `jest.fn()`s: the property under test
 * is that only the *first* caller inside a window creates a notification, and a
 * mock that always resolves the same value cannot express that. A Map with
 * check-and-set in one synchronous block gives the same single-winner guarantee
 * `SET … NX` gives, which is what makes the 100-concurrent-events test meaningful.
 */
class FakeDedupStore {
  readonly windowMs = DEFAULT_DEDUP_WINDOW_MS;
  readonly store = new Map<string, string>();
  failClaims = false;

  key(userId: string, eventType: string, resourceId: string): string {
    return `dedup:${userId}:${eventType}:${resourceId}`;
  }

  claim(key: string): Promise<{ claimed: boolean; existing?: string }> {
    if (this.failClaims) {
      // Mirrors the real store failing open on a Redis outage.
      return Promise.resolve({ claimed: true });
    }
    if (this.store.has(key)) {
      return Promise.resolve({
        claimed: false,
        existing: this.store.get(key),
      });
    }
    this.store.set(key, PENDING_MARKER);
    return Promise.resolve({ claimed: true });
  }

  recordNotificationId(key: string, notificationId: string): Promise<void> {
    if (this.store.has(key)) this.store.set(key, notificationId);
    return Promise.resolve();
  }

  release(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  entries(): Promise<Array<{ key: string; value: string; ttlMs: number }>> {
    return Promise.resolve(
      [...this.store.entries()].map(([key, value]) => ({
        key,
        value,
        ttlMs: this.windowMs,
      })),
    );
  }

  clear(): Promise<number> {
    const size = this.store.size;
    this.store.clear();
    return Promise.resolve(size);
  }
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let dedup: FakeDedupStore;

  beforeEach(async () => {
    dedup = new FakeDedupStore();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationDedupStore, useValue: dedup },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('persists a notification row when no duplicate exists', async () => {
      const expected = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Donation received',
        message: 'Your campaign received 10 XLM.',
        relatedId: 'c1',
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.notification.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.notification.create.mockResolvedValue(expected);

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Donation received',
        message: 'Your campaign received 10 XLM.',
        relatedId: 'c1',
      });

      // The database guard is now scoped to the deduplication window (#623).
      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          type: NotificationType.DONATION_RECEIVED,
          relatedId: 'c1',
          createdAt: { gte: expect.any(Date) },
        },
        select: { id: true },
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          type: NotificationType.DONATION_RECEIVED,
          title: 'Donation received',
          message: 'Your campaign received 10 XLM.',
          relatedId: 'c1',
        },
      });
      expect(result).toEqual(expected);
    });

    it('records the created notification id against the dedup key', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 't',
        message: 'm',
        relatedId: 'c1',
      });

      expect(dedup.store.get('dedup:u1:DONATION_RECEIVED:c1')).toBe('n1');
    });

    it('skips the DB write and bumps the existing row when a duplicate exists', async () => {
      const bumped = { id: 'n-existing', createdAt: new Date() };
      mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-existing' });
      mockPrisma.notification.update.mockResolvedValue(bumped);

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Donation received',
        message: 'Your campaign received 10 XLM.',
        relatedId: 'c1',
      });

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-existing' },
        data: { createdAt: expect.any(Date) },
      });
      expect(result).toEqual(bumped);
    });

    it('skips the idempotency check (and always creates) when relatedId is absent', async () => {
      const expected = {
        id: 'n2',
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Generic alert',
        message: 'No related resource.',
        relatedId: undefined,
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.notification.create.mockResolvedValue(expected);

      await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Generic alert',
        message: 'No related resource.',
      });

      // findFirst should NOT be called because relatedId is absent
      expect(mockPrisma.notification.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
      // …and no dedup window is opened for an unidentifiable event.
      expect(dedup.store.size).toBe(0);
    });

    it('releases the dedup key when the insert fails, so a retry is not swallowed', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create({
          userId: 'u1',
          type: NotificationType.DONATION_RECEIVED,
          title: 't',
          message: 'm',
          relatedId: 'c1',
        }),
      ).rejects.toThrow('db down');

      expect(dedup.store.size).toBe(0);
    });

    it('still delivers when the dedup store is unavailable', async () => {
      dedup.failClaims = true;
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 't',
        message: 'm',
        relatedId: 'c1',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('deduplication (#623)', () => {
    it('collapses 100 simultaneous events for the same user into one notification', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
      mockPrisma.notification.update.mockResolvedValue({ id: 'n1' });

      const event = {
        userId: 'u1',
        type: NotificationType.MILESTONE_REACHED,
        title: 'Milestone reached',
        message: 'Phase 1 complete',
        relatedId: 'm1',
      };

      const results = await Promise.all(
        Array.from({ length: 100 }, () => service.create(event)),
      );

      expect(results).toHaveLength(100);
      // Exactly one row is inserted; the other 99 resolve to the same one.
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      // …and one dedup window is open, not a hundred.
      expect(dedup.store.size).toBe(1);
    });

    it('bumps createdAt for every duplicate rather than dropping it silently', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
      mockPrisma.notification.update.mockResolvedValue({ id: 'n1' });

      const event = {
        userId: 'u1',
        type: NotificationType.MILESTONE_REACHED,
        title: 't',
        message: 'm',
        relatedId: 'm1',
      };

      await service.create(event);
      await service.create(event);
      await service.create(event);

      // One insert, two bumps — the user's list resurfaces the notification.
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.update).toHaveBeenCalledTimes(2);
    });

    it('does not suppress unrelated events', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n' });

      await service.create({
        userId: 'u1',
        type: NotificationType.MILESTONE_REACHED,
        title: 't',
        message: 'm',
        relatedId: 'm1',
      });
      // Same user and type, different resource.
      await service.create({
        userId: 'u1',
        type: NotificationType.MILESTONE_REACHED,
        title: 't',
        message: 'm',
        relatedId: 'm2',
      });
      // Same user and resource, different type.
      await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 't',
        message: 'm',
        relatedId: 'm1',
      });
      // Same event, different user.
      await service.create({
        userId: 'u2',
        type: NotificationType.MILESTONE_REACHED,
        title: 't',
        message: 'm',
        relatedId: 'm1',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(4);
      expect(dedup.store.size).toBe(4);
    });

    it('keys the window on userId, eventType and resourceId', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 't',
        message: 'm',
        relatedId: 'c1',
      });

      expect([...dedup.store.keys()]).toEqual([
        'dedup:u1:DONATION_RECEIVED:c1',
      ]);
    });
  });

  it('createMany() batches many notifications into a single insert', async () => {
    mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

    const result = await service.createMany([
      {
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Donation received',
        message: 'Your campaign received 10 XLM.',
        relatedId: 'c1',
      },
      {
        userId: 'u1',
        type: NotificationType.MILESTONE_REACHED,
        title: 'Milestone reached',
        message: 'Milestone "Phase 1" has been reached!',
        relatedId: 'm1',
      },
    ]);

    expect(mockPrisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'u1',
          type: NotificationType.DONATION_RECEIVED,
          title: 'Donation received',
          message: 'Your campaign received 10 XLM.',
          relatedId: 'c1',
        },
        {
          userId: 'u1',
          type: NotificationType.MILESTONE_REACHED,
          title: 'Milestone reached',
          message: 'Milestone "Phase 1" has been reached!',
          relatedId: 'm1',
        },
      ],
    });
    expect(result).toEqual({ count: 2, deduplicated: 0 });
  });

  it('createMany() collapses duplicates inside a single batch', async () => {
    mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n1' });
    mockPrisma.notification.update.mockResolvedValue({ id: 'n1' });

    const event = {
      userId: 'u1',
      type: NotificationType.MILESTONE_REACHED,
      title: 'Milestone reached',
      message: 'Phase 1 complete',
      relatedId: 'm1',
    };

    // A fan-out that lists the same recipient three times for one event.
    const result = await service.createMany([event, event, event]);

    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'u1',
          type: NotificationType.MILESTONE_REACHED,
          title: 'Milestone reached',
          message: 'Phase 1 complete',
          relatedId: 'm1',
        },
      ],
    });
    expect(result).toEqual({ count: 1, deduplicated: 2 });
  });

  it('createMany() short-circuits without querying when given no notifications', async () => {
    const result = await service.createMany([]);

    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, deduplicated: 0 });
  });

  it('findUnread() returns unread notifications ordered newest-first', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([]);
    await service.findUnread('u1');
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isRead: false },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('markRead() updates a single notification', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await service.markRead('n1', 'u1');
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u1' },
      data: { isRead: true },
    });
  });

  it('markAllRead() updates all unread notifications for a user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });
    await service.markAllRead('u1');
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isRead: false },
      data: { isRead: true },
    });
  });
});
