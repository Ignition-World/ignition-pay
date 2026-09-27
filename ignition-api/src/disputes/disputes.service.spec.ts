import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { DisputesService } from './disputes.service';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { Donation, DonationStatus } from '../donations/entities/donation.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisputeResolutionOutcome } from './dto/resolve-dispute.dto';
import { RESOLVABLE_DISPUTE_STATUSES } from './dispute-transitions';

describe('DisputesService', () => {
  let service: DisputesService;
  let queryRunnerMock: any;
  let notificationsServiceMock: any;
  let prismaMock: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    queryRunnerMock = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn().mockImplementation((entity, obj) => Promise.resolve(obj ?? entity)),
        create: jest.fn().mockImplementation((entity, obj) => obj ?? entity),
      },
    };

    notificationsServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };

    prismaMock = {
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: getRepositoryToken(Dispute), useValue: {} },
        { provide: getRepositoryToken(Donation), useValue: {} },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: DataSource,
          useValue: { createQueryRunner: () => queryRunnerMock },
        },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  });

  it('should resolve dispute as REFUNDED, update donation status and reconcile ledger state within transaction', async () => {
    const mockDonorWallet = { id: 'wallet-donor', balance: 50 };
    const mockRecipientWallet = { id: 'wallet-recipient', balance: 200 };
    const mockCampaign = { id: 'camp-1', raisedAmount: 500 };

    const mockDispute = {
      id: 'dispute-1',
      status: DisputeStatus.OPEN,
      donation: { id: 'don-1', status: DonationStatus.COMPLETED, amount: 100, assetCode: 'XLM' },
      donor: { id: 'user-donor', wallet: mockDonorWallet },
      recipient: { id: 'user-recipient', wallet: mockRecipientWallet },
      campaign: mockCampaign,
    };

    queryRunnerMock.manager.findOne.mockResolvedValue(mockDispute);

    const result = await service.resolveDispute('dispute-1', 'admin-1', {
      outcome: DisputeResolutionOutcome.REFUNDED,
      resolutionNotes: 'Approved refund request',
    });

    expect(queryRunnerMock.startTransaction).toHaveBeenCalled();
    expect(result.status).toBe(DisputeStatus.RESOLVED_REFUNDED);
    expect(mockDispute.donation.status).toBe(DonationStatus.REFUNDED);

    // Verify donor wallet was credited (+100)
    expect(mockDonorWallet.balance).toBe(150);

    // Verify recipient wallet was debited (-100)
    expect(mockRecipientWallet.balance).toBe(100);

    // Verify campaign raised amount was decremented (-100)
    expect(mockCampaign.raisedAmount).toBe(400);

    // Verify entity saves inside the queryRunner transaction
    expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(Wallet, mockDonorWallet);
    expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(Wallet, mockRecipientWallet);
    expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(Campaign, mockCampaign);
    expect(queryRunnerMock.manager.save).toHaveBeenCalledWith(
      Transaction,
      expect.objectContaining({
        fromWalletId: 'wallet-recipient',
        toWalletId: 'wallet-donor',
        amount: 100,
        assetCode: 'XLM',
      }),
    );

    expect(queryRunnerMock.commitTransaction).toHaveBeenCalled();
  });

  it('should resolve dispute as REJECTED without modifying ledger state', async () => {
    const mockDonorWallet = { id: 'wallet-donor', balance: 50 };
    const mockRecipientWallet = { id: 'wallet-recipient', balance: 200 };
    const mockCampaign = { id: 'camp-1', raisedAmount: 500 };

    const mockDispute = {
      id: 'dispute-2',
      status: DisputeStatus.OPEN,
      donation: { id: 'don-2', status: DonationStatus.COMPLETED, amount: 100 },
      donor: { id: 'user-donor', wallet: mockDonorWallet },
      recipient: { id: 'user-recipient', wallet: mockRecipientWallet },
      campaign: mockCampaign,
    };

    queryRunnerMock.manager.findOne.mockResolvedValue(mockDispute);

    const result = await service.resolveDispute('dispute-2', 'admin-1', {
      outcome: DisputeResolutionOutcome.REJECTED,
      resolutionNotes: 'Dispute rejected by admin',
    });

    expect(result.status).toBe(DisputeStatus.RESOLVED_REJECTED);
    expect(mockDispute.donation.status).toBe(DonationStatus.COMPLETED);
    expect(mockDonorWallet.balance).toBe(50);
    expect(mockRecipientWallet.balance).toBe(200);
    expect(mockCampaign.raisedAmount).toBe(500);
    expect(queryRunnerMock.commitTransaction).toHaveBeenCalled();
  });

  it('resolves without requiring a resolution note', async () => {
    const mockDispute = {
      id: 'dispute-3',
      status: DisputeStatus.OPENED,
      donation: { id: 'don-3', status: DonationStatus.COMPLETED, amount: 0 },
    };
    queryRunnerMock.manager.findOne.mockResolvedValue(mockDispute);

    const result = await service.resolveDispute('dispute-3', 'admin-1', {
      outcome: DisputeResolutionOutcome.REJECTED,
    });

    expect(result.status).toBe(DisputeStatus.RESOLVED_REJECTED);
    expect(result.resolutionNotes).toBeUndefined();
  });

  it('throws 404 when the dispute does not exist', async () => {
    queryRunnerMock.manager.findOne.mockResolvedValue(null);

    await expect(
      service.resolveDispute('missing', 'admin-1', {
        outcome: DisputeResolutionOutcome.REJECTED,
      }),
    ).rejects.toThrow(/not found/);
    expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
  });

  describe('status transitions (issue #620)', () => {
    const resolveFrom = (
      status: DisputeStatus,
      outcome: DisputeResolutionOutcome,
    ) => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-x',
        status,
        donation: { id: 'don-x', status: DonationStatus.COMPLETED, amount: 0 },
      });
      return service.resolveDispute('dispute-x', 'admin-1', { outcome });
    };

    it.each(RESOLVABLE_DISPUTE_STATUSES)(
      'resolves a dispute in status %s',
      async (status) => {
        await expect(
          resolveFrom(status, DisputeResolutionOutcome.REJECTED),
        ).resolves.toMatchObject({ status: DisputeStatus.RESOLVED_REJECTED });
      },
    );

    it.each([
      DisputeStatus.RESOLVED,
      DisputeStatus.RESOLVED_REFUNDED,
      DisputeStatus.RESOLVED_REJECTED,
      DisputeStatus.REJECTED,
    ])('rejects a second transition out of terminal status %s with 422', async (status) => {
      await expect(
        resolveFrom(status, DisputeResolutionOutcome.REFUNDED),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('answers 422 rather than 400 for an illegal transition', async () => {
      const error = await resolveFrom(
        DisputeStatus.RESOLVED_REFUNDED,
        DisputeResolutionOutcome.REFUNDED,
      ).catch((err) => err);

      expect(error.getStatus()).toBe(422);
    });

    it('rolls back and does not move money on an illegal transition', async () => {
      const mockDonorWallet = { id: 'wallet-donor', balance: 50 };
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-y',
        status: DisputeStatus.RESOLVED_REJECTED,
        donation: {
          id: 'don-y',
          status: DonationStatus.COMPLETED,
          amount: 100,
        },
        donor: { id: 'user-donor', wallet: mockDonorWallet },
      });

      await expect(
        service.resolveDispute('dispute-y', 'admin-1', {
          outcome: DisputeResolutionOutcome.REFUNDED,
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockDonorWallet.balance).toBe(50);
      expect(queryRunnerMock.manager.save).not.toHaveBeenCalled();
      expect(queryRunnerMock.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunnerMock.commitTransaction).not.toHaveBeenCalled();
    });
  });

  describe('audit trail (issue #620)', () => {
    it('writes the status transition to the audit log after the commit', async () => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-4',
        status: DisputeStatus.OPEN,
        donation: { id: 'don-4', status: DonationStatus.COMPLETED, amount: 0 },
      });

      await service.resolveDispute('dispute-4', 'admin-9', {
        outcome: DisputeResolutionOutcome.REFUNDED,
        resolutionNotes: 'approved',
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-9',
          action: 'ADMIN_ACTION',
          resourceType: 'Dispute',
          resourceId: 'dispute-4',
          details: JSON.stringify({
            action: 'DISPUTE_STATUS_TRANSITION',
            previousStatus: DisputeStatus.OPEN,
            nextStatus: DisputeStatus.RESOLVED_REFUNDED,
            outcome: DisputeResolutionOutcome.REFUNDED,
            resolutionNotes: 'approved',
          }),
        },
      });
    });

    it('does not fail the resolution when the audit write fails', async () => {
      prismaMock.auditLog.create.mockRejectedValue(new Error('audit down'));
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-5',
        status: DisputeStatus.UNDER_REVIEW,
        donation: { id: 'don-5', status: DonationStatus.COMPLETED, amount: 0 },
      });

      await expect(
        service.resolveDispute('dispute-5', 'admin-1', {
          outcome: DisputeResolutionOutcome.REJECTED,
        }),
      ).resolves.toMatchObject({ status: DisputeStatus.RESOLVED_REJECTED });
    });

    it('does not write an audit entry for an illegal transition', async () => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-6',
        status: DisputeStatus.REJECTED,
        donation: { id: 'don-6', status: DonationStatus.COMPLETED, amount: 0 },
      });

      await expect(
        service.resolveDispute('dispute-6', 'admin-1', {
          outcome: DisputeResolutionOutcome.REFUNDED,
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('notifications (issue #620)', () => {
    it('notifies the filer and the campaign creator', async () => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-7',
        filerId: 'user-filer',
        status: DisputeStatus.OPEN,
        donation: {
          id: 'don-7',
          status: DonationStatus.COMPLETED,
          amount: 0,
          campaign: { id: 'camp-7', creatorId: 'user-creator' },
        },
      });

      await service.resolveDispute('dispute-7', 'admin-1', {
        outcome: DisputeResolutionOutcome.REFUNDED,
      });

      const recipients = notificationsServiceMock.create.mock.calls.map(
        ([arg]: [any]) => arg.userId,
      );
      expect(recipients).toEqual(
        expect.arrayContaining(['user-filer', 'user-creator']),
      );
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-filer',
          type: NotificationType.DISPUTE_RESOLVED,
          relatedId: 'dispute-7',
        }),
      );
    });

    it('does not notify the same person twice', async () => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-8',
        filerId: 'user-filer',
        status: DisputeStatus.OPEN,
        donor: { id: 'user-filer' },
        donation: {
          id: 'don-8',
          status: DonationStatus.COMPLETED,
          amount: 0,
          campaign: { id: 'camp-8', creatorId: 'user-creator' },
        },
      });

      await service.resolveDispute('dispute-8', 'admin-1', {
        outcome: DisputeResolutionOutcome.REJECTED,
      });

      const recipients = notificationsServiceMock.create.mock.calls.map(
        ([arg]: [any]) => arg.userId,
      );
      expect(recipients).toEqual(['user-filer', 'user-creator']);
    });

    it('tells a rejected outcome apart from a refund', async () => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-11',
        filerId: 'user-filer',
        status: DisputeStatus.OPEN,
        donation: { id: 'don-11', status: DonationStatus.COMPLETED, amount: 0 },
      });

      await service.resolveDispute('dispute-11', 'admin-1', {
        outcome: DisputeResolutionOutcome.REJECTED,
      });

      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Dispute Resolved: Dispute Rejected',
          message: expect.stringContaining(DisputeResolutionOutcome.REJECTED),
        }),
      );
    });

    it('skips recipients the relation graph did not supply', async () => {
      queryRunnerMock.manager.findOne.mockResolvedValue({
        id: 'dispute-12',
        filerId: 'user-filer',
        status: DisputeStatus.OPEN,
        donation: { id: 'don-12', status: DonationStatus.COMPLETED, amount: 0 },
      });

      await service.resolveDispute('dispute-12', 'admin-1', {
        outcome: DisputeResolutionOutcome.REJECTED,
      });

      const recipients = notificationsServiceMock.create.mock.calls.map(
        ([arg]: [any]) => arg.userId,
      );
      expect(recipients).toEqual(['user-filer']);
    });
  });
});
