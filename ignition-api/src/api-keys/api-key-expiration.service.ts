import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_EMAIL } from '../queue/queue.constants';
import { EMAIL_JOB_SEND_NOTIFICATION } from '../queue/queue.jobs';

@Injectable()
export class ApiKeyExpirationService {
  private readonly logger = new Logger(ApiKeyExpirationService.name);

  /**
   * Issue #781 — the expiry sweep is kicked off from two places: the
   * bootstrap flow in `main.ts` and `AppModule`'s `onModuleInit`. The cached
   * promise below makes the sweep run at most once per process, so the second
   * call site is a no-op that reuses the first one's result. Without it, every
   * replica in a multi-replica deploy runs the sweep at the same time and the
   * same rows are expired twice.
   */
  private expirySweep: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
  ) {}

  /**
   * Entry point for the expiry sweep.
   *
   * `main.ts` calls this during bootstrap, and `AppModule.onModuleInit` ends
   * up here too. The sweep runs once; later calls await the same promise.
   */
  async expireApiKeys(): Promise<number> {
    if (!this.expirySweep) {
      this.expirySweep = this.runExpirySweep();
    }
    return this.expirySweep;
  }

  /**
   * Alias kept for the `AppModule.onModuleInit` call site. It funnels
   * through {@link expireApiKeys} so the "already ran" guard applies to it as
   * well.
   */
  async deactivateExpiredKeys(): Promise<number> {
    return this.expireApiKeys();
  }

  get expiryMs(): number {
    const configured = this.config.get<string>('API_KEY_TTL_MS');
    const parsed = Number(configured ?? 30 * 24 * 60 * 60 * 1000);

    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : 30 * 24 * 60 * 60 * 1000;
  }

  private async runExpirySweep(): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.expiryMs);

    // Warn users for keys expiring within 3 days
    const warningThresholdMs = 3 * 24 * 60 * 60 * 1000;
    const warningCutoff = new Date(now.getTime() + warningThresholdMs);

    const expiringKeys = await this.prisma.apiKey.findMany({
      where: {
        isActive: true,
        expiresAt: {
          lte: warningCutoff,
          gt: now,
        },
        warningSentAt: null,
      },
      include: {
        user: true,
      },
    });

    for (const key of expiringKeys) {
      if (key.user?.email) {
        await this.emailQueue.add(EMAIL_JOB_SEND_NOTIFICATION, {
          to: key.user.email,
          subject: 'API Key Expiring Soon',
          body: `Your API key "${key.name}" is expiring on ${key.expiresAt?.toISOString()}. Please generate a new key before it expires.`,
        });

        await this.prisma.apiKey.update({
          where: { id: key.id },
          data: { warningSentAt: now },
        });

        this.logger.log(
          `Sent expiration warning to ${key.user.email} for API key ${key.id}`,
        );
      }
    }

    // Deactivate keys that have passed their rotation grace period
    // These are old keys that were kept active during rotation but the grace period has expired
    const rotationExpiredResult = await this.prisma.apiKey.updateMany({
      where: {
        isActive: true,
        rotationOfId: { not: null },
        rotationExpiresAt: { lte: now },
      },
      data: {
        isActive: false,
      },
    });

    if (rotationExpiredResult.count > 0) {
      this.logger.log(
        `Deactivated ${rotationExpiredResult.count} API key(s) with expired rotation grace period`,
      );
    }

    // Deactivate regularly expired or stale keys
    const result = await this.prisma.apiKey.updateMany({
      where: {
        isActive: true,
        rotationOfId: null, // Don't double-count rotation keys
        OR: [{ expiresAt: { lte: now } }, { lastUsedAt: { lte: cutoff } }],
      },
      data: {
        isActive: false,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Deactivated ${result.count} stale API key(s)`);
    }

    return result.count + rotationExpiredResult.count;
  }

  async touchUsage(keyId: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  }
}
