import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyScopeGuard } from './api-key-scope.guard';

const mockReflector = (scopes: string[] | undefined) =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(scopes),
  }) as unknown as Reflector;

const mockPrisma = (wallet: { id: string; userId: string } | null = null) =>
  ({
    wallet: {
      findFirst: jest.fn().mockResolvedValue(wallet),
    },
  }) as unknown as PrismaService;

const buildContext = (
  scope: string | undefined,
  params: Record<string, string> = {},
) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: scope !== undefined ? { id: 'user-1', scope } : undefined,
        params,
        query: {},
        body: {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('ApiKeyScopeGuard', () => {
  it('passes when no scope is required', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(undefined), mockPrisma());
    await expect(guard.canActivate(buildContext('read'))).resolves.toBe(true);
  });

  it('passes when key scope satisfies required scope (exact match)', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']), mockPrisma());
    await expect(guard.canActivate(buildContext('write'))).resolves.toBe(true);
  });

  it('passes when key has higher scope than required (admin satisfies write)', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']), mockPrisma());
    await expect(guard.canActivate(buildContext('admin'))).resolves.toBe(true);
  });

  it('passes when key has admin scope for read requirement', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['read']), mockPrisma());
    await expect(guard.canActivate(buildContext('admin'))).resolves.toBe(true);
  });

  it('throws ForbiddenException when key scope is insufficient', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']), mockPrisma());
    await expect(guard.canActivate(buildContext('read'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when key scope is read and admin required', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['admin']), mockPrisma());
    await expect(guard.canActivate(buildContext('read'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when no user is attached to the request', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['read']), mockPrisma());
    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('error message includes required scope when no user is attached', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']), mockPrisma());
    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(
      'write',
    );
  });

  it('error message includes required scope when user has no scope', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['admin']), mockPrisma());
    await expect(guard.canActivate(buildContext(null))).rejects.toThrow(
      'admin',
    );
  });

  it('error message includes key scope and required scope', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']), mockPrisma());
    await expect(guard.canActivate(buildContext('read'))).rejects.toThrow(
      "'read'",
    );
    await expect(guard.canActivate(buildContext('read'))).rejects.toThrow(
      'write',
    );
  });

  it('rejects a request for a wallet the key does not own (Issue #774)', async () => {
    const guard = new ApiKeyScopeGuard(
      mockReflector(['read']),
      mockPrisma({ id: 'wallet-1', userId: 'another-user' }),
    );

    await expect(
      guard.canActivate(buildContext('read', { id: 'wallet-1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a request for a wallet the key owns (Issue #774)', async () => {
    const guard = new ApiKeyScopeGuard(
      mockReflector(['read']),
      mockPrisma({ id: 'wallet-1', userId: 'user-1' }),
    );

    await expect(
      guard.canActivate(buildContext('read', { id: 'wallet-1' })),
    ).resolves.toBe(true);
  });

  it('leaves a request that names no wallet to the route (Issue #774)', async () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['read']), mockPrisma());

    await expect(
      guard.canActivate(buildContext('read', { id: 'campaign-1' })),
    ).resolves.toBe(true);
  });

  it('lets an admin-scoped key reach any wallet (Issue #774)', async () => {
    const prismaMock = {
      wallet: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'wallet-1', userId: 'another-user' }),
      },
    };
    const guard = new ApiKeyScopeGuard(
      mockReflector(['read']),
      prismaMock as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(buildContext('admin', { id: 'wallet-1' })),
    ).resolves.toBe(true);
    expect(prismaMock.wallet.findFirst).not.toHaveBeenCalled();
  });
});
