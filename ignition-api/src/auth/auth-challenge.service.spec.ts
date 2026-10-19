import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';
import { AuthChallengeService, ChallengeRecord } from './auth-challenge.service';

jest.mock('keyv', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

interface MockKeyv {
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
}

describe('AuthChallengeService', () => {
  let service: AuthChallengeService;
  let cache: MockKeyv;
  let config: ConfigService;

  const walletAddress = 'GABC1234567890ABCDEF1234567890ABCDEF12345';

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    // Issue #231 — STELLAR_HOME_DOMAIN now scopes the issued challenge.
    config = new ConfigService({
      AUTH_CHALLENGE_TTL_MS: '300000',
      AUTH_CHALLENGE_REFRESH_WINDOW_MS: '60000',
      STELLAR_HOME_DOMAIN: 'ignition-pay.local',
    });

    service = new AuthChallengeService(cache as unknown as Keyv, config);
  });

  // ---------------------------------------------------------------------------
  // issueChallenge
  // ---------------------------------------------------------------------------

  describe('issueChallenge', () => {
    it('returns a challenge prefixed with the home domain (#231)', async () => {
      cache.set.mockResolvedValue('OK');

      const result = await service.issueChallenge(walletAddress);

      expect(result.challenge).toMatch(
        /^ignition-pay\.local:login:[0-9a-f]+:[0-9]+$/,
      );
    });

    it('returns an ISO-8601 expiresAt string (#225)', async () => {
      cache.set.mockResolvedValue('OK');
      const before = Date.now();

      const result = await service.issueChallenge(walletAddress);

      const expiresAtMs = new Date(result.expiresAt).getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 300000 - 10);
      expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + 300000 + 100);
    });

    it('stores a ChallengeRecord (challenge + expiresAt) in cache (#225)', async () => {
      cache.set.mockResolvedValue('OK');

      const result = await service.issueChallenge(walletAddress);

      const [key, record, ttl] = cache.set.mock.calls[0];
      expect(key).toBe(`auth:challenge:${walletAddress}`);
      expect(record).toMatchObject({ challenge: result.challenge });
      expect(typeof record.expiresAt).toBe('number');
      expect(ttl).toBe(300000);
    });

    it('trims whitespace around STELLAR_HOME_DOMAIN (#231)', async () => {
      const trimmedConfig = new ConfigService({
        AUTH_CHALLENGE_TTL_MS: '300000',
        STELLAR_HOME_DOMAIN: '  staging.ignition-pay.org  ',
      });
      const trimmedService = new AuthChallengeService(
        cache as unknown as Keyv,
        trimmedConfig,
      );

      const result = await trimmedService.issueChallenge(walletAddress);

      expect(result.challenge.startsWith('staging.ignition-pay.org:login:')).toBe(true);
      expect(result.challenge).not.toContain('  ');
    });

    it('falls back to ignition-pay.local when STELLAR_HOME_DOMAIN is unset (#231)', async () => {
      const fallbackConfig = new ConfigService({
        AUTH_CHALLENGE_TTL_MS: '300000',
      });
      const fallbackService = new AuthChallengeService(
        cache as unknown as Keyv,
        fallbackConfig,
      );

      const result = await fallbackService.issueChallenge(walletAddress);

      expect(result.challenge.startsWith('ignition-pay.local:login:')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // consumeChallenge
  // ---------------------------------------------------------------------------

  describe('consumeChallenge', () => {
    it('accepts a valid challenge stored as a ChallengeRecord (#225)', async () => {
      const issued = await (() => {
        cache.set.mockResolvedValue('OK');
        return service.issueChallenge(walletAddress);
      })();

      const record: ChallengeRecord = {
        challenge: issued.challenge,
        expiresAt: Date.now() + 300000,
      };
      cache.get.mockResolvedValue(record);
      cache.delete.mockResolvedValue(true);

      await expect(
        service.consumeChallenge(walletAddress, issued.challenge),
      ).resolves.not.toThrow();

      expect(cache.delete).toHaveBeenCalledWith(
        `auth:challenge:${walletAddress}`,
      );
    });

    it('accepts a legacy plain-string challenge (rolling-deploy compat)', async () => {
      // Cache stores the old string shape (pre-#225 node still wrote strings).
      const legacyChallenge = 'ignition-pay.local:login:abcdef:1700000000';
      cache.get.mockResolvedValue(legacyChallenge as unknown as ChallengeRecord);
      cache.delete.mockResolvedValue(true);

      await expect(
        service.consumeChallenge(walletAddress, legacyChallenge),
      ).resolves.not.toThrow();
    });

    it('rejects a replayed or expired challenge', async () => {
      cache.get.mockResolvedValue(undefined);

      await expect(
        service.consumeChallenge(walletAddress, 'expired-challenge'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a challenge that does not match the stored one', async () => {
      const record: ChallengeRecord = {
        challenge: 'ignition-pay.local:login:real:1700000000',
        expiresAt: Date.now() + 300000,
      };
      cache.get.mockResolvedValue(record);

      await expect(
        service.consumeChallenge(walletAddress, 'ignition-pay.local:login:tampered:9999'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------------
  // refreshChallenge (#225)
  // ---------------------------------------------------------------------------

  describe('refreshChallenge (#225)', () => {
    it('issues a fresh challenge when no existing record is present', async () => {
      cache.get.mockResolvedValue(undefined);
      cache.set.mockResolvedValue('OK');

      const result = await service.refreshChallenge(walletAddress);

      expect(result.challenge).toMatch(
        /^ignition-pay\.local:login:[0-9a-f]+:[0-9]+$/,
      );
      expect(cache.set).toHaveBeenCalled();
    });

    it('returns the existing challenge unchanged when outside the refresh window', async () => {
      const futureExpiry = Date.now() + 200_000; // 200 s remaining, window is 60 s
      const record: ChallengeRecord = {
        challenge: 'ignition-pay.local:login:existing:1700000000',
        expiresAt: futureExpiry,
      };
      cache.get.mockResolvedValue(record);

      const result = await service.refreshChallenge(walletAddress);

      expect(result.challenge).toBe(record.challenge);
      expect(result.expiresAt).toBe(new Date(futureExpiry).toISOString());
      // Must NOT have re-issued.
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('mints a new challenge when within the refresh window', async () => {
      const nearExpiryRecord: ChallengeRecord = {
        challenge: 'ignition-pay.local:login:old:1700000000',
        expiresAt: Date.now() + 30_000, // only 30 s left, window is 60 s
      };
      cache.get.mockResolvedValue(nearExpiryRecord);
      cache.set.mockResolvedValue('OK');

      const result = await service.refreshChallenge(walletAddress);

      expect(result.challenge).not.toBe(nearExpiryRecord.challenge);
      expect(result.challenge).toMatch(
        /^ignition-pay\.local:login:[0-9a-f]+:[0-9]+$/,
      );
      expect(cache.set).toHaveBeenCalled();
    });

    it('mints a new challenge when the record is already expired', async () => {
      const expiredRecord: ChallengeRecord = {
        challenge: 'ignition-pay.local:login:stale:1700000000',
        expiresAt: Date.now() - 5_000, // expired 5 s ago
      };
      cache.get.mockResolvedValue(expiredRecord);
      cache.set.mockResolvedValue('OK');

      const result = await service.refreshChallenge(walletAddress);

      expect(result.challenge).not.toBe(expiredRecord.challenge);
      expect(cache.set).toHaveBeenCalled();
    });

    it('respects a custom AUTH_CHALLENGE_REFRESH_WINDOW_MS', async () => {
      const customConfig = new ConfigService({
        AUTH_CHALLENGE_TTL_MS: '300000',
        AUTH_CHALLENGE_REFRESH_WINDOW_MS: '120000', // 2-minute window
        STELLAR_HOME_DOMAIN: 'ignition-pay.local',
      });
      const customService = new AuthChallengeService(
        cache as unknown as Keyv,
        customConfig,
      );

      // 90 s remaining — within the 120 s window → should re-issue.
      const record: ChallengeRecord = {
        challenge: 'ignition-pay.local:login:old:1700000000',
        expiresAt: Date.now() + 90_000,
      };
      cache.get.mockResolvedValue(record);
      cache.set.mockResolvedValue('OK');

      const result = await customService.refreshChallenge(walletAddress);

      expect(result.challenge).not.toBe(record.challenge);
      expect(cache.set).toHaveBeenCalled();
    });
  });
});
