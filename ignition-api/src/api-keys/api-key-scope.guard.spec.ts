import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScopeGuard } from './api-key-scope.guard';

const mockReflector = (scopes: string[] | undefined) =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(scopes),
  }) as unknown as Reflector;

const buildContext = (scope: string | undefined) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: scope !== undefined ? { scope } : undefined,
      }),
    }),
  }) as unknown as ExecutionContext;

describe('ApiKeyScopeGuard', () => {
  it('passes when no scope is required', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(undefined));
    expect(guard.canActivate(buildContext('read'))).toBe(true);
  });

  it('passes when key scope satisfies required scope (exact match)', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']));
    expect(guard.canActivate(buildContext('write'))).toBe(true);
  });

  it('passes when key has higher scope than required (admin satisfies write)', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']));
    expect(guard.canActivate(buildContext('admin'))).toBe(true);
  });

  it('passes when key has admin scope for read requirement', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['read']));
    expect(guard.canActivate(buildContext('admin'))).toBe(true);
  });

  it('throws ForbiddenException when key scope is insufficient', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']));
    expect(() => guard.canActivate(buildContext('read'))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when key scope is read and admin required', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['admin']));
    expect(() => guard.canActivate(buildContext('read'))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when no user is attached to the request', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['read']));
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('error message includes required scope when no user is attached', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']));
    try {
      guard.canActivate(buildContext(undefined));
    } catch (err) {
      expect((err as ForbiddenException).message).toContain('write');
    }
  });

  it('error message includes required scope when user has no scope', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['admin']));
    try {
      guard.canActivate(buildContext(null));
    } catch (err) {
      expect((err as ForbiddenException).message).toContain('admin');
    }
  });

  it('error message includes key scope and required scope', () => {
    const guard = new ApiKeyScopeGuard(mockReflector(['write']));
    try {
      guard.canActivate(buildContext('read'));
    } catch (err) {
      expect((err as ForbiddenException).message).toContain("'read'");
      expect((err as ForbiddenException).message).toContain('write');
    }
  });
});
