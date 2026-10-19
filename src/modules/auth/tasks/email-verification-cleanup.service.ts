import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm'; // Or Prisma / TypeORM / Drizzle depending on ORM
import { LessThan, Repository } from 'typeorm';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';

@Injectable()
export class EmailVerificationCleanupService {
  private readonly logger = new Logger(EmailVerificationCleanupService.name);

  constructor(
    @InjectRepository(EmailVerificationToken)
    private readonly tokenRepository: Repository<EmailVerificationToken>,
  ) {}

  /**
   * Cron job running daily at midnight to prune expired or used verification tokens.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron(): Promise<number> {
    this.logger.log('Starting email verification token cleanup job...');

    const now = new Date();

    try {
      // Deletes tokens that either have a usedAt date OR whose expiresAt timestamp is in the past
      const result = await this.tokenRepository
        .createQueryBuilder()
        .delete()
        .from(EmailVerificationToken)
        .where('usedAt IS NOT NULL')
        .orWhere('expiresAt < :now', { now })
        .execute();

      const deletedCount = result.affected ?? 0;
      this.logger.log(
        `Successfully pruned ${deletedCount} expired/used email verification tokens.`,
      );

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup email verification tokens', error);
      throw error;
    }
  }
}