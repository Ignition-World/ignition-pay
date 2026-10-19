import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { KycAuditLog } from './entities/kyc-audit-log.entity';
import { KycWebhookDto } from './dto/kyc-webhook.dto';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(KycAuditLog)
    private readonly auditLogRepository: Repository<KycAuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Processes verified KYC webhook: updates user status and records audit log in a transaction
   */
  async processWebhook(payload: KycWebhookDto): Promise<void> {
    const { userId, applicantId, status, reason, metadata } = payload;

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      const previousStatus = user.kycStatus;

      // Update User KYC Status
      user.kycStatus = status;
      await manager.save(User, user);

      // Create Audit Log Entry
      const auditLog = manager.create(KycAuditLog, {
        userId,
        applicantId,
        previousStatus,
        newStatus: status,
        reason: reason ?? null,
        metadata: metadata ?? null,
      });

      await manager.save(KycAuditLog, auditLog);

      this.logger.log(
        `KYC status for user ${userId} updated from ${previousStatus} to ${status}`,
      );
    });
  }
}