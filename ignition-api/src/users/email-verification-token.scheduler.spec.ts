import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_EMAIL_TOKEN_SWEEP_INTERVAL_MS,
  EmailVerificationTokenScheduler,
} from './email-verification-token.scheduler';
import { UsersService } from './users.service';

describe('EmailVerificationTokenScheduler', () => {
  let usersService: UsersService;
  let scheduler: EmailVerificationTokenScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    usersService = {
      purgeExpiredEmailVerificationTokens: jest.fn().mockResolvedValue(0),
    } as unknown as UsersService;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function build(env: Record<string, string> = {}) {
    return new EmailVerificationTokenScheduler(
      usersService,
      new ConfigService(env),
    );
  }

  it('purges once on startup', async () => {
    scheduler = build();
    await scheduler.onModuleInit();

    expect(
      (usersService.purgeExpiredEmailVerificationTokens as jest.Mock).mock
        .calls.length,
    ).toBe(1);
    scheduler.onModuleDestroy();
  });

  it('sweeps again on the configured interval', async () => {
    scheduler = build({ EMAIL_TOKEN_SWEEP_INTERVAL_MS: '1000' });
    await scheduler.onModuleInit();

    const purge = usersService.purgeExpiredEmailVerificationTokens as jest.Mock;
    expect(purge).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    expect(purge).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(2000);
    expect(purge).toHaveBeenCalledTimes(4);

    scheduler.onModuleDestroy();
  });

  it('stops sweeping after the module is destroyed', async () => {
    scheduler = build({ EMAIL_TOKEN_SWEEP_INTERVAL_MS: '1000' });
    await scheduler.onModuleInit();
    scheduler.onModuleDestroy();

    const purge = usersService.purgeExpiredEmailVerificationTokens as jest.Mock;
    jest.advanceTimersByTime(5000);

    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('swallows a purge failure instead of crashing the app', async () => {
    (
      usersService.purgeExpiredEmailVerificationTokens as jest.Mock
    ).mockRejectedValueOnce(new Error('db down'));

    scheduler = build();
    await expect(scheduler.sweep()).resolves.toBe(0);
  });

  it('defaults the interval to 24 hours', async () => {
    scheduler = build();
    await scheduler.onModuleInit();

    const purge = usersService.purgeExpiredEmailVerificationTokens as jest.Mock;
    jest.advanceTimersByTime(DEFAULT_EMAIL_TOKEN_SWEEP_INTERVAL_MS - 1);
    expect(purge).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    expect(purge).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
  });
});
