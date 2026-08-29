import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { Donation, DonationStatus } from '../donations/entities/donation.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Transaction, TransactionStatus } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ResolveDisputeDto, DisputeResolutionOutcome } from './dto/resolve-dispute.dto';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    @InjectRepository(Donation)
    private readonly donationRepository: Repository<Donation>,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resolves an open dispute, updates the linked donation status (if refunded),
   * reconciles associated ledger state (wallet balances, campaign raised amount,
   * reversal transaction record), and dispatches notifications to both donor and recipient.
   */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: ResolveDisputeDto,
  ): Promise<Dispute> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const dispute = await queryRunner.manager.findOne(Dispute, {
        where: { id: disputeId },
        relations: [
          'donation',
          'donation.campaign',
          'donor',
          'donor.wallet',
          'recipient',
          'recipient.wallet',
          'campaign',
        ],
      });

      if (!dispute) {
        throw new NotFoundException(`Dispute with ID ${disputeId} not found`);
      }

      if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.UNDER_REVIEW) {
        throw new BadRequestException(
          `Dispute ${disputeId} is already resolved or closed (current status: ${dispute.status})`,
        );
      }

      const donation = dispute.donation;

      if (dto.outcome === DisputeResolutionOutcome.REFUNDED) {
        dispute.status = DisputeStatus.RESOLVED_REFUNDED;
        if (donation) {
          donation.status = DonationStatus.REFUNDED;
          await queryRunner.manager.save(Donation, donation);

          const refundAmount = Number(donation.amount || 0);

          if (refundAmount > 0) {
            // 1. Reconcile Donor Wallet (Credit)
            const donorWallet =
              dispute.donor?.wallet ||
              (dispute.donor?.balance !== undefined ? dispute.donor : null);
            if (donorWallet) {
              donorWallet.balance = Number(donorWallet.balance || 0) + refundAmount;
              await queryRunner.manager.save(Wallet, donorWallet);
            }

            // 2. Reconcile Recipient Wallet (Debit)
            const recipientWallet =
              dispute.recipient?.wallet ||
              (dispute.recipient?.balance !== undefined ? dispute.recipient : null);
            if (recipientWallet) {
              recipientWallet.balance = Math.max(
                0,
                Number(recipientWallet.balance || 0) - refundAmount,
              );
              await queryRunner.manager.save(Wallet, recipientWallet);
            }

            // 3. Reconcile Campaign Raised Amount (Decrement)
            const campaign = dispute.campaign || donation.campaign;
            if (campaign) {
              campaign.raisedAmount = Math.max(
                0,
                Number(campaign.raisedAmount || 0) - refundAmount,
              );
              await queryRunner.manager.save(Campaign, campaign);
            }

            // 4. Record Reversal Transaction in Ledger
            const refundTxData = {
              fromWalletId: recipientWallet?.id || dispute.recipient?.id || 'unknown',
              toWalletId: donorWallet?.id || dispute.donor?.id || 'unknown',
              amount: refundAmount,
              assetCode: donation.assetCode || 'XLM',
              status: TransactionStatus.COMPLETED,
              metadata: {
                type: 'DISPUTE_REFUND',
                disputeId: dispute.id,
                donationId: donation.id,
                notes: dto.resolutionNotes,
              },
            };

            const refundTx = queryRunner.manager.create
              ? queryRunner.manager.create(Transaction, refundTxData)
              : refundTxData;

            await queryRunner.manager.save(Transaction, refundTx);
          }
        }
      } else {
        dispute.status = DisputeStatus.RESOLVED_REJECTED;
      }

      dispute.resolvedBy = adminId;
      dispute.resolutionNotes = dto.resolutionNotes;
      dispute.resolvedAt = new Date();

      const updatedDispute = await queryRunner.manager.save(Dispute, dispute);

      await queryRunner.commitTransaction();

      // Dispatch non-blocking notifications post-commit
      this.dispatchResolutionNotifications(updatedDispute, dto.outcome).catch((err) => {
        this.logger.error(`Failed to dispatch dispute notifications for ${disputeId}:`, err.stack);
      });

      return updatedDispute;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async dispatchResolutionNotifications(
    dispute: Dispute,
    outcome: DisputeResolutionOutcome,
  ): Promise<void> {
    const isRefunded = outcome === DisputeResolutionOutcome.REFUNDED;

    await Promise.all([
      this.notificationsService.send({
        recipientId: dispute.donor?.id || dispute.filerId,
        subject: `Dispute Resolved: ${isRefunded ? 'Refund Processed' : 'Dispute Closed'}`,
        body: `Your dispute for donation #${dispute.donation?.id} has been resolved. Outcome: ${outcome}.`,
      }),
      this.notificationsService.send({
        recipientId: dispute.recipient?.id,
        subject: `Dispute Update for Donation #${dispute.donation?.id}`,
        body: `The dispute filed on donation #${dispute.donation?.id} has been resolved with outcome: ${outcome}.`,
      }),
    ]);
  }
}
