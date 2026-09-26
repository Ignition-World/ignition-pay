import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { Permission, UserRole } from './permissions.map';

const mockReflector = (permissions: Permission[] | undefined) =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(permissions),
  }) as unknown as Reflector;

const buildContext = (role: string | undefined, scopes?: string[]) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user:
          role !== undefined
            ? { role, ...(scopes !== undefined ? { scopes } : {}) }
            : undefined,
      }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  const service = new PermissionsService();

  it('passes when no permissions are required', () => {
    const guard = new PermissionsGuard(mockReflector(undefined), service);
    expect(guard.canActivate(buildContext(UserRole.USER))).toBe(true);
  });

  it('passes when USER has the required permission (legacy role-based path)', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ]),
      service,
    );
    expect(guard.canActivate(buildContext(UserRole.USER))).toBe(true);
  });

  it('throws ForbiddenException when USER lacks admin permission', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_KYC]),
      service,
    );
    expect(() => guard.canActivate(buildContext(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });

  it('passes when ADMIN has any permission', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_ROLE, Permission.WALLET_CREATE]),
      service,
    );
    expect(guard.canActivate(buildContext(UserRole.ADMIN))).toBe(true);
  });

  it('throws ForbiddenException when user has no role', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ]),
      service,
    );
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('error message lists the required permissions', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_KYC]),
      service,
    );
    try {
      guard.canActivate(buildContext(UserRole.USER));
    } catch (err) {
      expect((err as ForbiddenException).message).toContain(
        Permission.ADMIN_USERS_KYC,
      );
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Issue #230 — least-privilege enforcement.
  //
  // The guard must prefer the JWT-encoded `scopes` claim over the
  // role-based fallback so a demoted role can no longer access admin
  // endpoints as soon as the next access token is minted.
  // ────────────────────────────────────────────────────────────────────────

  it('passes when user.scopes includes every required permission (#230)', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ, Permission.WALLET_CREATE]),
      service,
    );
    expect(
      guard.canActivate(
        buildContext(UserRole.USER, ['wallet:read', 'wallet:create']),
      ),
    ).toBe(true);
  });

  it('throws ForbiddenException when user.scopes is missing a required permission (#230)', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ, Permission.ADMIN_USERS_KYC]),
      service,
    );
    expect(() =>
      guard.canActivate(
        buildContext(UserRole.ADMIN, ['wallet:read']), // narrow token
      ),
    ).toThrow(ForbiddenException);
  });

  it('does NOT widen a narrow scope using the user role (#230)', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.ADMIN_USERS_KYC]),
      service,
    );
    // Despite being ADMIN (which would satisfy the role-based path), the
    // explicit narrow scope set contained only `wallet:read`, so an
    // attempt to access ADMIN_USERS_KYC must fail.
    expect(() =>
      guard.canActivate(buildContext(UserRole.ADMIN, ['wallet:read'])),
    ).toThrow(ForbiddenException);
  });

  it('falls back to role check when user.scopes is undefined (legacy tokens, #230)', () => {
    const guard = new PermissionsGuard(
      mockReflector([Permission.WALLET_READ]),
      service,
    );
    // roles_only → scopes absent → fall through to PermissionsService.
    expect(guard.canActivate(buildContext(UserRole.USER))).toBe(true);
  });
});
