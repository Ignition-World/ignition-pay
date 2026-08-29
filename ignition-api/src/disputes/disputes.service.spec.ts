import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DisputesService } from './disputes.service';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { Donation, DonationStatus } from '../donations/entities/donation.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { DisputeResolutionOutcome } from './dto/resolve-dispute.dto';

describe('DisputesService', () => {
  let service: DisputesService;
  let queryRunnerMock: any;
  let notificationsServiceMock: any;

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
      send: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: getRepositoryToken(Dispute), useValue: {} },
        { provide: getRepositoryToken(Donation), useValue: {} },
        { provide: NotificationsService, useValue: notificationsServiceMock },
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
    expect(notificationsServiceMock.send).toHaveBeenCalledTimes(2);
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
});