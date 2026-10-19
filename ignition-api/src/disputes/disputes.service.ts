import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotificationType } from '@prisma/client';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { Donation, DonationStatus } from '../donations/entities/donation.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Transaction, TransactionStatus } from '../transactions/entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveDisputeDto, DisputeResolutionOutcome } from './dto/resolve-dispute.dto';
import { assertTransitionAllowed } from './dispute-transitions';

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
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolves an open dispute, updates the linked donation status (if refunded),
   * reconciles associated ledger state (wallet balances, campaign raised amount,
   * reversal transaction record), and dispatches notifications to the filer and
   * the campaign creator.
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

      // Issue #620 — every status change is validated against the transition
      // map rather than an ad-hoc check, so the legal lifecycle lives in one
      // place. Throws 422 UnprocessableEntity on an illegal edge.
      const previousStatus = dispute.status;
      const nextStatus =
        dto.outcome === DisputeResolutionOutcome.REFUNDED
          ? DisputeStatus.RESOLVED_REFUNDED
          : DisputeStatus.RESOLVED_REJECTED;

      assertTransitionAllowed(disputeId, previousStatus, nextStatus);

      dispute.status = nextStatus;

      const donation = dispute.donation;

      if (dto.outcome === DisputeResolutionOutcome.REFUNDED) {
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
      }

      dispute.resolvedBy = adminId;
      dispute.resolutionNotes = dto.resolutionNotes;
      dispute.resolvedAt = new Date();

      const updatedDispute = await queryRunner.manager.save(Dispute, dispute);

      await queryRunner.commitTransaction();

      // Post-commit side effects. The ledger state has already moved by this
      // point, so neither the audit trail nor the notifications are allowed to
      // fail the request — they are logged instead.
      await this.recordTransitionAudit(updatedDispute, adminId, {
        previousStatus,
        nextStatus,
        outcome: dto.outcome,
        resolutionNotes: dto.resolutionNotes ?? null,
      });

      // Dispatch non-blocking notifications post-commit
      this.dispatchResolutionNotifications(updatedDispute, dto.outcome).catch(
        (err) => {
          this.logger.error(
            `Failed to dispatch dispute notifications for ${disputeId}:`,
            err.stack,
          );
        },
      );

      return updatedDispute;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Issue #620 — write the status change to the audit log. The dispute tables
   * are TypeORM and the audit log is Prisma, so this cannot join the
   * transaction above; it runs immediately after the commit instead.
   */
  private async recordTransitionAudit(
    dispute: Dispute,
    adminId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'ADMIN_ACTION',
          resourceType: 'Dispute',
          resourceId: dispute.id,
          details: JSON.stringify({
            action: 'DISPUTE_STATUS_TRANSITION',
            ...details,
          }),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write dispute audit log for ${dispute.id}:`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Issue #620 — notify everyone affected by the outcome: the dispute filer and
   * the campaign creator, plus the donor/recipient parties when the relation
   * graph supplied them. Duplicates collapse to a single notification.
   */
  private async dispatchResolutionNotifications(
    dispute: Dispute,
    outcome: DisputeResolutionOutcome,
  ): Promise<void> {
    const isRefunded = outcome === DisputeResolutionOutcome.REFUNDED;
    const donationId = dispute.donation?.id ?? dispute.donationId;

    const title = isRefunded
      ? 'Dispute Resolved: Refund Processed'
      : 'Dispute Resolved: Dispute Rejected';
    const message =
      `Dispute for donation #${donationId} was resolved. ` +
      `Outcome: ${outcome}.`;

    const creatorId =
      dispute.campaign?.creatorId ?? dispute.donation?.campaign?.creatorId;

    const recipientIds = [
      dispute.filerId,
      creatorId,
      dispute.donor?.id,
      dispute.recipient?.id,
    ].filter(
      (id, index, all): id is string =>
        typeof id === 'string' && id.length > 0 && all.indexOf(id) === index,
    );

    await Promise.all(
      recipientIds.map((userId) =>
        this.notificationsService.create({
          userId,
          type: NotificationType.DISPUTE_RESOLVED,
          title,
          message,
          relatedId: dispute.id,
        }),
      ),
    );
  }
}
