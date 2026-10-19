import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsService } from './permissions/permissions.service';
import { AuthTokenService } from './auth-token.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let permissionsService: PermissionsService;
  let tokenService: { isAccessTokenBlacklisted: jest.Mock };

  beforeEach(async () => {
    permissionsService = new PermissionsService();
    tokenService = {
      isAccessTokenBlacklisted: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: PermissionsService,
          useValue: permissionsService,
        },
        {
          provide: AuthTokenService,
          useValue: tokenService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should throw UnauthorizedException if sub is missing', async () => {
      await expect(strategy.validate({} as any)).rejects.toThrow(
        new UnauthorizedException('Invalid token'),
      );
    });

    it('should return validated user object if sub is present (no scope claim, falls back to role)', async () => {
      const payload = {
        sub: 'user-123',
        walletAddress: 'G123',
        email: 'user@example.com',
        role: 'USER',
        sid: 'sess-123',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        sub: 'user-123',
        userId: 'user-123',
        walletAddress: 'G123',
        email: 'user@example.com',
        role: 'USER',
        sessionId: 'sess-123',
        sid: 'sess-123',
        scopes: expect.any(Array),
      });
      // Legacy token (no scope claim) still resolves a non-empty scops array
      // via the role→permission fallback so guards continue to enforce.
      expect((result as any).scopes.length).toBeGreaterThan(0);
    });

    // ────────────────────────────────────────────────────────────────────
    // Issue #230 — when a `scope` claim is present, the strategy exposes
    // those tokens on req.user.scopes (and DOES NOT silently swap them out
    // for the role-derived permission set).
    // ────────────────────────────────────────────────────────────────────

    it('prefers JWT-encoded `scope` claim over the role fallback (#230)', async () => {
      const payload = {
        sub: 'user-123',
        walletAddress: 'G123',
        role: 'ADMIN', // role would grant everything
        scope: 'wallet:read', // but the token explicitly narrows to one scope
      };

      const result = await strategy.validate(payload);

      expect((result as any).scopes).toEqual(['wallet:read']);
    });

    it('parses multi-token scopes from a single space-delimited string (#230)', async () => {
      const payload = {
        sub: 'user-123',
        role: 'USER',
        scope: 'wallet:read transaction:read campaign:read',
      };

      const result = await strategy.validate(payload);

      expect((result as any).scopes).toEqual([
        'wallet:read',
        'transaction:read',
        'campaign:read',
      ]);
    });

    it('tolerates extra whitespace and dedupes when parsing scope (#230)', async () => {
      const payload = {
        sub: 'user-123',
        role: 'USER',
        scope: '  wallet:read   wallet:read  transaction:read  ',
      };

      const result = await strategy.validate(payload);

      expect((result as any).scopes).toEqual([
        'wallet:read',
        'transaction:read',
      ]);
    });

    it('should throw UnauthorizedException when session is blacklisted', async () => {
      tokenService.isAccessTokenBlacklisted.mockResolvedValue(true);

      await expect(
        strategy.validate({
          sub: 'user-123',
          walletAddress: 'G123',
          role: 'USER',
          sid: 'sess-revoked',
        }),
      ).rejects.toThrow(new UnauthorizedException('Session has been revoked'));

      expect(tokenService.isAccessTokenBlacklisted).toHaveBeenCalledWith(
        'sess-revoked',
      );
    });

    it('should not check blacklist when sid is absent', async () => {
      const result = await strategy.validate({
        sub: 'user-123',
        walletAddress: 'G123',
        role: 'USER',
      });

      expect(result).toEqual(expect.objectContaining({ sub: 'user-123' }));
      expect(tokenService.isAccessTokenBlacklisted).not.toHaveBeenCalled();
    });
  });
});
