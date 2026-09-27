import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';

/**
 * Default sweep interval for `EmailVerificationTokenScheduler` (24 hours).
 */
export const DEFAULT_EMAIL_TOKEN_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Issue #617 — periodic cleanup of spent email verification tokens.
 *
 * Reuses the `setInterval` sweep pattern already used by
 * `queue/processors/horizon-polling.scheduler.ts` rather than `@nestjs/schedule`,
 * which is not a declared dependency of this workspace and therefore cannot be
 * added or relied upon here.
 *
 * Runs once on startup (so tokens that expired while the process was down are
 * removed) and then on every interval. Failures are logged and swallowed: a
 * cleanup problem must never take the API down.
 */
@Injectable()
export class EmailVerificationTokenScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EmailVerificationTokenScheduler.name);
  private readonly sweepIntervalMs: number;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly usersService: UsersService,
    config: ConfigService,
  ) {
    this.sweepIntervalMs = Number(
      config.get('EMAIL_TOKEN_SWEEP_INTERVAL_MS') ??
        DEFAULT_EMAIL_TOKEN_SWEEP_INTERVAL_MS,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.sweep();

    this.timer = setInterval(
      () => void this.sweep(),
      this.sweepIntervalMs,
    );
    // Do not hold the event loop open on shutdown.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Run one sweep. Public so it can be triggered manually and unit tested. */
  async sweep(): Promise<number> {
    try {
      return await this.usersService.purgeExpiredEmailVerificationTokens();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Email verification token cleanup failed: ${message}`);
      return 0;
    }
  }
}
