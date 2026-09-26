import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findFirst: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
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

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          type: NotificationType.DONATION_RECEIVED,
          relatedId: 'c1',
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

    it('skips the DB write and returns the existing row when a duplicate exists', async () => {
      const existing = { id: 'n-existing' };
      mockPrisma.notification.findFirst.mockResolvedValue(existing);

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.DONATION_RECEIVED,
        title: 'Donation received',
        message: 'Your campaign received 10 XLM.',
        relatedId: 'c1',
      });

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
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
    expect(result).toEqual({ count: 2 });
  });

  it('createMany() short-circuits without querying when given no notifications', async () => {
    const result = await service.createMany([]);

    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0 });
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
