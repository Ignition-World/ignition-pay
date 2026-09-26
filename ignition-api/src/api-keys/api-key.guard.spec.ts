import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyExpirationService } from './api-key-expiration.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let prisma: {
    apiKey: { findUnique: jest.Mock; update: jest.Mock };
  };
  let expirationService: { touchUsage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      apiKey: { findUnique: jest.fn(), update: jest.fn() },
    };
    expirationService = {
      touchUsage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ApiKeyExpirationService, useValue: expirationService },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw UnauthorizedException if x-api-key header is missing', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Missing X-API-Key header'),
    );
  });

  it('should throw UnauthorizedException if API key record is missing', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-api-key': 'my-key' },
        }),
      }),
    } as unknown as ExecutionContext;

    prisma.apiKey.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid API key'),
    );
  });

  it('should throw UnauthorizedException if API key record is revoked', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-api-key': 'my-key' },
        }),
      }),
    } as unknown as ExecutionContext;

    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      isActive: false,
      rotationOfId: null,
      rotationExpiresAt: null,
      user: {
        id: 'user-1',
        walletAddress: 'G123',
        role: 'USER',
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or revoked API key'),
    );
  });

  it('should return true and attach user if API key is active', async () => {
    const req = {
      headers: { 'x-api-key': 'my-key' },
      user: null as any,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;

    const mockRecord = {
      id: 'key-1',
      isActive: true,
      scope: 'ALL',
      rotationOfId: null,
      rotationExpiresAt: null,
      expiresAt: null,
      user: {
        id: 'user-1',
        walletAddress: 'G123',
        role: 'USER',
      },
    };
    prisma.apiKey.findUnique.mockResolvedValue(mockRecord);

    const res = await guard.canActivate(context);

    expect(res).toBe(true);
    expect(req.user).toEqual({
      id: 'user-1',
      walletAddress: 'G123',
      role: 'USER',
      apiKeyId: 'key-1',
      scope: 'ALL',
    });
    const keyHash = createHash('sha256').update('my-key').digest('hex');
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash },
      include: {
        user: { select: { id: true, walletAddress: true, role: true } },
      },
    });
  });

  it('accepts the old key during the rotation grace period', async () => {
    const req = {
      headers: { 'x-api-key': 'old-key' },
      user: null as any,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;

    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'old-key-1',
      isActive: true,
      scope: 'ALL',
      rotationOfId: 'new-key-2',
      rotationExpiresAt: new Date(Date.now() + 86_400_000),
      expiresAt: null,
      user: {
        id: 'user-1',
        walletAddress: 'G123',
        role: 'USER',
      },
    });

    const res = await guard.canActivate(context);

    expect(res).toBe(true);
    expect(req.user).toEqual(
      expect.objectContaining({ apiKeyId: 'old-key-1', scope: 'ALL' }),
    );
  });

  it('rejects the old key once the rotation grace period has expired', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-api-key': 'old-key' },
        }),
      }),
    } as unknown as ExecutionContext;

    prisma.apiKey.findUnique.mockResolvedValue({
      id: 'old-key-1',
      isActive: true,
      scope: 'ALL',
      rotationOfId: 'new-key-2',
      rotationExpiresAt: new Date(Date.now() - 1_000),
      expiresAt: null,
      user: {
        id: 'user-1',
        walletAddress: 'G123',
        role: 'USER',
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        'API key rotation grace period has expired. Use your new key.',
      ),
    );
  });
});
