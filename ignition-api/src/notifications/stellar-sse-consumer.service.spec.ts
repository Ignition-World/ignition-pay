/**
 * Unit tests for the Stellar SSE Consumer (Issue #265).
 *
 * The tests verify the domain-logic layer (de-duplication, cursor persistence,
 * notification dispatch, campaign/milestone status updates) without a live
 * Horizon connection.  The `consumeStream` / `streamPayments` methods that
 * deal with the fetch API are not exercised here — integration / e2e coverage
 * is expected for those.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';

import { StellarSseConsumerService } from './stellar-sse-consumer.service';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn((callback) => callback(mockPrisma)),
  wallet: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  campaign: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  milestone: {
    update: jest.fn(),
  },
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockNotifications = {
  create: jest.fn(),
  createMany: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, def: unknown) => {
    if (key === 'HORIZON_URL') return 'https://horizon-testnet.stellar.org';
    return def;
  }),
};

describe('StellarSseConsumerService', () => {
  let service: StellarSseConsumerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Prevent onModuleInit from trying to connect to a real DB
    mockPrisma.wallet.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarSseConsumerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<StellarSseConsumerService>(StellarSseConsumerService);

    // initialise without hitting the DB again
    await module.init();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

   it('watchAddress() skips already-watched addresses', async () => {
    // Register the address once so it appears in controllers map
    const address = 'GADDRESS1';
    // Manually insert into the controllers map to simulate a live watcher
    (service as any).controllers.set(address, new AbortController());

    const streamSpy = jest.spyOn(service as any, 'streamPayments');
    await service.watchAddress(address);
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it('watchAddress() restarts a watcher whose controller is already aborted', async () => {
    const address = 'GDEADWATCHER';
    // Simulate a watcher whose loop died without cleaning up the map entry.
    const deadController = new AbortController();
    deadController.abort();
    (service as any).controllers.set(address, deadController);

    const streamSpy = jest.spyOn(service as any, 'streamPayments');
    await service.watchAddress(address);

    // A fresh stream loop should be (re)started even though a stale entry exists.
    expect(streamSpy).toHaveBeenCalledWith(address);
  });

  it('stopWatching() aborts the controller and removes the entry', () => {
    const address = 'GADDRESS2';
    const ctrl = new AbortController();
    (service as any).controllers.set(address, ctrl);

    service.stopWatching(address);

    expect(ctrl.signal.aborted).toBe(true);
    expect((service as any).controllers.has(address)).toBe(false);
  });

  describe('dispatchDomainEvents()', () => {
    const address = 'GDEPOSITADDRESS';
    const record = {
      id: 'op1',
      type: 'payment',
      paging_token: '100',
      transaction_hash: 'txhash1',
      to: address,
      from: 'GSENDER',
      amount: '50',
      asset_code: 'XLM',
    };

    beforeEach(() => {
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'w1',
        userId: 'u1',
      });
    });

    it('creates DONATION_RECEIVED notification for every active campaign', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c1',
          title: 'Test Campaign',
          goalAmount: 1000,
          milestones: [],
          donations: [],
        },
      ]);
      mockPrisma.campaign.update.mockResolvedValue({
        id: 'c1',
        title: 'Test Campaign',
        goalAmount: 1000,
        raisedAmount: 50,
        milestones: [],
        status: 'ACTIVE',
      });

      await (service as any).dispatchDomainEvents(address, record);

      expect(mockNotifications.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: NotificationType.DONATION_RECEIVED,
            relatedId: 'c1',
          }),
        ]),
      );
    });

    it('creates MILESTONE_REACHED notification when totalRaised >= targetAmount', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c1',
          title: 'Test Campaign',
          goalAmount: 1000,
          milestones: [
            { id: 'm1', title: 'First milestone', targetAmount: 50, status: 'ACTIVE' },
          ],
          donations: [], // 0 existing; amount from record = 50 => reaches target
        },
      ]);
      mockPrisma.campaign.update.mockResolvedValue({
        id: 'c1',
        title: 'Test Campaign',
        goalAmount: 1000,
        raisedAmount: 50,
        milestones: [
          { id: 'm1', title: 'First milestone', targetAmount: 50, status: 'ACTIVE' },
        ],
        status: 'ACTIVE',
      });
      mockPrisma.milestone.update.mockResolvedValue({});

      await (service as any).dispatchDomainEvents(address, record);

      expect(mockNotifications.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: NotificationType.MILESTONE_REACHED,
            relatedId: 'm1',
          }),
        ]),
      );
      expect(mockPrisma.milestone.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) },
      });
    });

    it('does NOT create MILESTONE_REACHED when totalRaised < targetAmount', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c1',
          title: 'Test Campaign',
          goalAmount: 1000,
          milestones: [
            { id: 'm1', title: 'Big milestone', targetAmount: 500, status: 'ACTIVE' },
          ],
          donations: [], // 0 existing; amount = 50 → not reached
        },
      ]);
      mockPrisma.campaign.update.mockResolvedValue({
        id: 'c1',
        title: 'Test Campaign',
        goalAmount: 1000,
        raisedAmount: 50,
        milestones: [
          { id: 'm1', title: 'Big milestone', targetAmount: 500, status: 'ACTIVE' },
        ],
        status: 'ACTIVE',
      });

      await (service as any).dispatchDomainEvents(address, record);

      const batched: Array<{ type: NotificationType }> =
        mockNotifications.createMany.mock.calls.flatMap(([list]) => list);
      const milestoneNotification = batched.find(
        (p) => p.type === NotificationType.MILESTONE_REACHED,
      );
      expect(milestoneNotification).toBeUndefined();
    });

    it('creates CAMPAIGN_COMPLETED when goalAmount is met', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([
        {
          id: 'c1',
          title: 'Goal Campaign',
          goalAmount: 50, // exactly met by this payment
          milestones: [],
          donations: [],
        },
      ]);
      mockPrisma.campaign.update.mockResolvedValue({
        id: 'c1',
        title: 'Goal Campaign',
        goalAmount: 50,
        raisedAmount: 50,
        milestones: [],
        status: 'ACTIVE',
      });

      await (service as any).dispatchDomainEvents(address, record);

      expect(mockNotifications.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: NotificationType.CAMPAIGN_COMPLETED,
            relatedId: 'c1',
          }),
        ]),
      );
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { status: 'COMPLETED' },
      });
    });

    it('skips dispatch when wallet is not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await (service as any).dispatchDomainEvents(address, record);

      expect(mockNotifications.create).not.toHaveBeenCalled();
      expect(mockNotifications.createMany).not.toHaveBeenCalled();
    });
  });

  describe('handlePayment()', () => {
    const address = 'GDEPOSITADDRESS';
    const record = {
      id: 'op1',
      type: 'payment',
      paging_token: '200',
      transaction_hash: 'txhash_dedup',
      to: address,
      from: 'GSENDER',
      amount: '10',
      asset_code: 'XLM',
    };

    it('skips processing when SET NX returns falsy — key already claimed (de-duplication)', async () => {
      // cache.set() returning false/null simulates an NX miss (key already existed).
      mockCache.set.mockResolvedValue(false);
      const dispatchSpy = jest.spyOn(service as any, 'dispatchDomainEvents');

      await (service as any).handlePayment(address, record);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('processes the payment when SET NX returns truthy — key was newly written', async () => {
      // cache.set() returning true simulates an NX hit (key was not present).
      mockCache.set.mockResolvedValue(true);
      const dispatchSpy = jest
        .spyOn(service as any, 'dispatchDomainEvents')
        .mockResolvedValue(undefined);

      await (service as any).handlePayment(address, record);

      expect(dispatchSpy).toHaveBeenCalledWith(address, record);
    });

    it('does NOT call cache.get() — only cache.set() is used for atomic dedup', async () => {
      mockCache.set.mockResolvedValue(false);

      await (service as any).handlePayment(address, record);

      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('skips non-payment operation types', async () => {
      const nonPayment = { ...record, type: 'manage_sell_offer' };
      const dispatchSpy = jest.spyOn(service as any, 'dispatchDomainEvents');
      mockCache.set.mockResolvedValue(true);

      await (service as any).handlePayment(address, nonPayment);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('skips payments whose `to` field does not match the watched address', async () => {
      const wrongTarget = { ...record, to: 'GOTHER' };
      const dispatchSpy = jest.spyOn(service as any, 'dispatchDomainEvents');
      mockCache.set.mockResolvedValue(true);

      await (service as any).handlePayment(address, wrongTarget);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('persists cursor after successful dispatch', async () => {
      mockCache.set.mockResolvedValue(true);
      jest.spyOn(service as any, 'dispatchDomainEvents').mockResolvedValue(undefined);

      await (service as any).handlePayment(address, record);

      expect(mockCache.set).toHaveBeenCalledWith(
        `horizon:cursor:${address}`,
        record.paging_token,
      );
    });
  });
});
