import {
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from './auth-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions/permissions.service';
import Keyv from 'keyv';
import { UserRole } from '@prisma/client';

jest.mock('keyv', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    })),
  };
});

interface MockKeyv {
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
}

interface MockJwtService {
  verify: jest.Mock;
  sign: jest.Mock;
}

interface MockPrismaService {
  user: {
    findUnique: jest.Mock;
  };
}

interface MockPermissionsService {
  getScopeStringForRole: jest.Mock;
  getUserPermissions: jest.Mock;
}

const mockPrisma = (): MockPrismaService => ({
  user: {
    findUnique: jest.fn(),
  },
});

/** Helper: build a JSON-serialised StoredRefreshRecord as stored in Redis */
function storedRecord(token: string, familyId: string): string {
  return JSON.stringify({ token, familyId });
}

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let jwt: MockJwtService;
  let prisma: MockPrismaService;
  let cache: MockKeyv;
  let config: ConfigService;
  let perms: MockPermissionsService;

  const testUser = {
    id: 'user-123',
    walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
    role: UserRole.USER,
    isActive: true,
  };

  const validRefreshToken = 'valid-refresh-token';
  const newRefreshToken = 'new-refresh-token';
  const newAccessToken = 'new-access-token';
  const testFamilyId = 'test-family-uuid-1234';

  beforeEach(() => {
    jwt = {
      verify: jest.fn(),
      sign: jest.fn(),
    };
    prisma = mockPrisma();
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    config = new ConfigService({
      JWT_SECRET: 'test-jwt-secret',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    });
    perms = {
      getScopeStringForRole: jest
        .fn()
        .mockReturnValue('wallet:read wallet:create'),
      getUserPermissions: jest
        .fn()
        .mockReturnValue(['wallet:read', 'wallet:create']),
    };

    service = new AuthTokenService(
      jwt as unknown as JwtService,
      config,
      prisma as unknown as PrismaService,
      perms as unknown as PermissionsService,
      cache as unknown as Keyv,
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateAndRotate — baseline validation (unchanged from pre-#226)
  // ──────────────────────────────────────────────────────────────────────────

  describe('validateAndRotate', () => {
    // Property 1: Empty and whitespace refresh tokens are always rejected
    it('rejects empty refresh token', async () => {
      await expect(service.validateAndRotate('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // Property 2: Payloads without a valid sub claim are always rejected
    it('returns 401 for missing sub claim', async () => {
      jwt.verify.mockReturnValue({ exp: Date.now() / 1000 + 604800 });
      await expect(service.validateAndRotate('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 for empty sub claim', async () => {
      jwt.verify.mockReturnValue({ sub: '', exp: Date.now() / 1000 + 604800 });
      await expect(service.validateAndRotate('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Refresh token expired" for expired token', async () => {
      const expiredError = new Error('Token expired');
      (expiredError as any).name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw expiredError;
      });
      await expect(service.validateAndRotate('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 "Invalid refresh token" for invalid signature', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      await expect(service.validateAndRotate('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 when user not found', async () => {
      jwt.verify.mockReturnValue({ sub: 'non-existent-user' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns 401 when user is not active', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue({ ...testUser, isActive: false });
      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns 401 "Refresh token has been revoked" when no stored token', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(undefined);
      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    // Property 3: Token mismatch always produces a revoked response
    it('returns 401 "Refresh token has been revoked" when stored token does not match (no family overlap)', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id, fid: 'family-A' });
      prisma.user.findUnique.mockResolvedValue(testUser);
      // stored record has a *different* familyId — not a reuse-detection case
      cache.get.mockResolvedValue(
        storedRecord('different-stored-token', 'family-B'),
      );
      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns 503 when Prisma throws', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));
      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('returns 503 when cache.get throws', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockRejectedValue(new Error('Redis error'));
      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    // Property 6: Token rotation replaces the stored token
    it('returns new token pair and rotates stored record on success', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id, fid: testFamilyId });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(
        storedRecord(validRefreshToken, testFamilyId),
      );
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      cache.delete.mockResolvedValue(true);
      cache.set.mockResolvedValue('OK');

      const result = await service.validateAndRotate(validRefreshToken);

      // Property 4: New access token has correct claims including scope (#230)
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: testUser.id,
          walletAddress: testUser.walletAddress,
          role: testUser.role,
          scope: 'wallet:read wallet:create',
        }),
        expect.objectContaining({
          secret: 'test-jwt-secret',
          expiresIn: '15m',
        }),
      );

      // Issue #226: new refresh token carries the same family ID
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: testUser.id, fid: testFamilyId }),
        expect.objectContaining({
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        }),
      );

      // Stored record is JSON with token + familyId
      expect(cache.delete).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
      );
      expect(cache.set).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
        JSON.stringify({ token: newRefreshToken, familyId: testFamilyId }),
        7 * 24 * 60 * 60 * 1000,
      );

      // Issue #230: scope re-derived on rotation
      expect(perms.getScopeStringForRole).toHaveBeenCalledWith(testUser.role);

      // Property 7: Response always contains all required fields
      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
      });
    });

    it('returns 503 when cache rotation write fails', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id, fid: testFamilyId });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(
        storedRecord(validRefreshToken, testFamilyId),
      );
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      cache.delete.mockResolvedValue(true);
      cache.set.mockRejectedValue(new Error('Redis write error'));

      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    // Property 10: Error responses never leak the refresh token
    it('does not leak refresh token in error response', async () => {
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(undefined);

      try {
        await service.validateAndRotate(validRefreshToken);
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(JSON.stringify(error)).not.toContain(validRefreshToken);
      }
    });

    // ── Issue #226: backward-compat — legacy plain-string stored tokens ──
    it('accepts a legacy plain-string stored token (no familyId) and rotates it', async () => {
      // Old tokens stored before #226 were raw strings, not JSON
      jwt.verify.mockReturnValue({ sub: testUser.id });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(validRefreshToken); // plain string, not JSON
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      cache.delete.mockResolvedValue(true);
      cache.set.mockResolvedValue('OK');

      const result = await service.validateAndRotate(validRefreshToken);

      expect(result.accessToken).toBe(newAccessToken);
      expect(result.refreshToken).toBe(newRefreshToken);
      expect(result.tokenType).toBe('Bearer');

      // The new stored record must be JSON even for a legacy rotation
      const setCall = cache.set.mock.calls[0];
      const parsedRecord = JSON.parse(setCall[1] as string);
      expect(parsedRecord).toHaveProperty('token', newRefreshToken);
      expect(parsedRecord).toHaveProperty('familyId');
      expect(parsedRecord.familyId).toBeTruthy();
    });
  });

  // ── Issue #226: Reuse detection ─────────────────────────────────────────

  describe('validateAndRotate — reuse detection (#226)', () => {
    it('revokes the token family when a rotated-out token is re-presented (same familyId)', async () => {
      // "oldToken" was already rotated out; "currentToken" is the live one.
      // Attacker presents oldToken — same familyId as the stored record.
      const oldToken = 'old-rotated-token';
      const currentToken = 'current-valid-token';
      const familyId = 'shared-family-id';

      jwt.verify.mockReturnValue({ sub: testUser.id, fid: familyId });
      prisma.user.findUnique.mockResolvedValue(testUser);
      // Stored record holds the *current* (rotated-in) token, same family
      cache.get.mockResolvedValue(storedRecord(currentToken, familyId));
      cache.delete.mockResolvedValue(true);

      await expect(service.validateAndRotate(oldToken)).rejects.toThrow(
        UnauthorizedException,
      );

      // The entire family must have been nuked
      expect(cache.delete).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
      );
    });

    it('returns 401 "Refresh token has been revoked" (does not reveal reuse-detection to attacker)', async () => {
      const oldToken = 'old-rotated-token';
      const familyId = 'shared-family-id';

      jwt.verify.mockReturnValue({ sub: testUser.id, fid: familyId });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(
        storedRecord('current-valid-token', familyId),
      );
      cache.delete.mockResolvedValue(true);

      try {
        await service.validateAndRotate(oldToken);
        fail('Expected UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).message).toBe(
          'Refresh token has been revoked',
        );
      }
    });

    it('does NOT trigger reuse detection when familyIds differ (unrelated invalid token)', async () => {
      const randomBadToken = 'completely-unrelated-token';

      jwt.verify.mockReturnValue({ sub: testUser.id, fid: 'attacker-family' });
      prisma.user.findUnique.mockResolvedValue(testUser);
      // Stored record has a completely different family
      cache.get.mockResolvedValue(
        storedRecord('current-valid-token', 'legitimate-family'),
      );

      await expect(service.validateAndRotate(randomBadToken)).rejects.toThrow(
        UnauthorizedException,
      );

      // delete should NOT be called — no family revocation for unrelated tokens
      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('still revokes the family even when cache.delete throws during reuse detection', async () => {
      const oldToken = 'old-rotated-token';
      const familyId = 'shared-family-id';

      jwt.verify.mockReturnValue({ sub: testUser.id, fid: familyId });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(
        storedRecord('current-valid-token', familyId),
      );
      // Revocation itself fails — should still propagate 401, not 503
      cache.delete.mockRejectedValue(new Error('Redis error'));

      await expect(service.validateAndRotate(oldToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does NOT trigger reuse detection when the presented token has no fid claim', async () => {
      // Legacy token without a fid — mismatch but no family to compare
      const legacyToken = 'legacy-no-fid-token';

      jwt.verify.mockReturnValue({ sub: testUser.id }); // no fid
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(
        storedRecord('current-valid-token', 'some-family'),
      );

      await expect(service.validateAndRotate(legacyToken)).rejects.toThrow(
        UnauthorizedException,
      );

      // No family revocation for tokens without fid
      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('does NOT trigger reuse detection when stored record has no familyId (legacy stored token)', async () => {
      const presentedToken = 'some-token-with-fid';

      jwt.verify.mockReturnValue({ sub: testUser.id, fid: 'some-family' });
      prisma.user.findUnique.mockResolvedValue(testUser);
      // Legacy stored record: plain string, not JSON
      cache.get.mockResolvedValue('different-plain-string-token');

      await expect(service.validateAndRotate(presentedToken)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('allows the legitimate user to re-authenticate after family revocation', async () => {
      // After a reuse-detection revocation the user must call issueTokenPair
      // again (re-login). Verify issueTokenPair writes a fresh record.
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      cache.set.mockResolvedValue('OK');

      const result = await service.issueTokenPair(testUser);

      expect(result.accessToken).toBe(newAccessToken);
      expect(result.refreshToken).toBe(newRefreshToken);

      const setCall = cache.set.mock.calls[0];
      const parsedRecord = JSON.parse(setCall[1] as string);
      expect(parsedRecord).toHaveProperty('token', newRefreshToken);
      expect(parsedRecord.familyId).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // issueTokenPair
  // ──────────────────────────────────────────────────────────────────────────

  describe('issueTokenPair', () => {
    it('mints access + refresh tokens with correct claims, including scope (#230)', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      const result = await service.issueTokenPair(testUser);

      expect(perms.getScopeStringForRole).toHaveBeenCalledWith(testUser.role);
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: testUser.id,
          walletAddress: testUser.walletAddress,
          role: testUser.role,
          scope: 'wallet:read wallet:create',
        }),
        expect.objectContaining({ secret: 'test-jwt-secret', expiresIn: '15m' }),
      );
      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
      });
    });

    it('embeds fid claim in the refresh token (#226)', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      await service.issueTokenPair(testUser);

      const refreshCall = jwt.sign.mock.calls[1];
      expect(refreshCall[0]).toHaveProperty('fid');
      expect(typeof refreshCall[0].fid).toBe('string');
      expect(refreshCall[0].fid.length).toBeGreaterThan(0);
    });

    it('uses the provided familyId when one is passed (#226)', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      await service.issueTokenPair(testUser, undefined, testFamilyId);

      const refreshCall = jwt.sign.mock.calls[1];
      expect(refreshCall[0].fid).toBe(testFamilyId);

      const setCall = cache.set.mock.calls[0];
      const parsedRecord = JSON.parse(setCall[1] as string);
      expect(parsedRecord.familyId).toBe(testFamilyId);
    });

    it('embeds sid in both tokens when sessionId is provided', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      await service.issueTokenPair(testUser, 'sess-abc');

      expect(jwt.sign.mock.calls[0][0]).toEqual(
        expect.objectContaining({ sub: testUser.id, sid: 'sess-abc' }),
      );
      expect(jwt.sign.mock.calls[1][0]).toEqual(
        expect.objectContaining({ sub: testUser.id, sid: 'sess-abc' }),
      );
    });

    it('omits sid claim when sessionId is not provided', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      await service.issueTokenPair(testUser);

      expect(jwt.sign.mock.calls[1][0]).not.toHaveProperty('sid');
    });

    it('writes a JSON StoredRefreshRecord to cache under refresh:{walletAddress} (#226)', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      await service.issueTokenPair(testUser);

      expect(cache.set).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
        expect.stringMatching(/"token":/),
        7 * 24 * 60 * 60 * 1000,
      );

      const setCall = cache.set.mock.calls[0];
      const parsed = JSON.parse(setCall[1] as string);
      expect(parsed.token).toBe(newRefreshToken);
      expect(parsed.familyId).toBeTruthy();
    });

    it('returns 503 when cache.set fails', async () => {
      jwt.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);
      cache.set.mockRejectedValue(new Error('Redis write error'));

      await expect(service.issueTokenPair(testUser)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // revokeRefreshToken
  // ──────────────────────────────────────────────────────────────────────────

  describe('revokeRefreshToken', () => {
    it('deletes the refresh record for the given wallet address', async () => {
      cache.delete.mockResolvedValue(true);

      await service.revokeRefreshToken(testUser.walletAddress);

      expect(cache.delete).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
      );
    });

    it('is a no-op when walletAddress is null, undefined, or empty', async () => {
      await service.revokeRefreshToken(null);
      await service.revokeRefreshToken(undefined);
      await service.revokeRefreshToken('');

      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('returns 503 when cache.delete throws', async () => {
      cache.delete.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.revokeRefreshToken(testUser.walletAddress),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // revokeAllTokensForUser (#226)
  // ──────────────────────────────────────────────────────────────────────────

  describe('revokeAllTokensForUser (#226)', () => {
    it('deletes the refresh record for the given wallet address', async () => {
      cache.delete.mockResolvedValue(true);

      await service.revokeAllTokensForUser(testUser.walletAddress);

      expect(cache.delete).toHaveBeenCalledWith(
        `refresh:${testUser.walletAddress}`,
      );
    });

    it('is a no-op when walletAddress is empty', async () => {
      await service.revokeAllTokensForUser('');

      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('returns 503 when cache.delete throws', async () => {
      cache.delete.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.revokeAllTokensForUser(testUser.walletAddress),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('subsequent validateAndRotate calls return 401 after family revocation', async () => {
      // Simulate the state after revokeAllTokensForUser has run:
      // no record in cache, so any presented token is rejected.
      jwt.verify.mockReturnValue({ sub: testUser.id, fid: testFamilyId });
      prisma.user.findUnique.mockResolvedValue(testUser);
      cache.get.mockResolvedValue(undefined);

      await expect(
        service.validateAndRotate(validRefreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Access-token blacklist
  // ──────────────────────────────────────────────────────────────────────────

  describe('blacklistAccessToken', () => {
    it('stores a revoked flag for the session id with 15-minute TTL', async () => {
      cache.set.mockResolvedValue('OK');

      await service.blacklistAccessToken('sess-abc');

      expect(cache.set).toHaveBeenCalledWith(
        'revoked:sess-abc',
        '1',
        15 * 60 * 1000,
      );
    });

    it('returns 503 when cache.set fails', async () => {
      cache.set.mockRejectedValue(new Error('Redis error'));

      await expect(service.blacklistAccessToken('sess-abc')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('isAccessTokenBlacklisted', () => {
    it('returns true when session id is in the blacklist', async () => {
      cache.get.mockResolvedValue('1');

      const result = await service.isAccessTokenBlacklisted('sess-abc');

      expect(result).toBe(true);
      expect(cache.get).toHaveBeenCalledWith('revoked:sess-abc');
    });

    it('returns false when session id is not in the blacklist', async () => {
      cache.get.mockResolvedValue(undefined);

      const result = await service.isAccessTokenBlacklisted('sess-abc');

      expect(result).toBe(false);
    });

    it('returns false (fail-open) when cache throws', async () => {
      cache.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.isAccessTokenBlacklisted('sess-abc');

      expect(result).toBe(false);
    });
  });
});
