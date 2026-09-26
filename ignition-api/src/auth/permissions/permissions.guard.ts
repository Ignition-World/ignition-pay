import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permissions.decorator';
import { Permission } from './permissions.map';
import { PermissionsService } from './permissions.service';

/**
 * Issue #230 — least-privilege enforcement.
 *
 * Resolution order when `@RequirePermissions(...)` is set on a handler:
 *   1. `req.user.scopes` (encoded in the JWT `scope` claim) — definitive.
 *      Tokens are now the source of truth, so demoting a role takes
 *      effect as soon as the user's next access token is minted.
 *   2. `PermissionsService.hasPermission(user.role, required)` — fallback
 *      for legacy tokens minted before the `scope` claim existed. Keeps
 *      the access-token TTL window (15 min) zero-downtime during rollout.
 *
 * If even the role lookup cannot satisfy the requirement, throws 403.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('No authenticated user on request');
    }

    // Prefer the JWT-encoded scopes; they are the authoritative source of
    // permission grants because they are computed at token-mint time. This
    // matters most when a role is changed mid-session — the next refresh
    // bakes the new scope set into the next access token.
    const tokenScopes: string[] | undefined = Array.isArray(user.scopes)
      ? user.scopes
      : undefined;

    if (tokenScopes && tokenScopes.length > 0) {
      const missing = required.filter((p) => !tokenScopes.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Insufficient scope. Required: ${missing.join(', ')}`,
        );
      }
      return true;
    }

    // Fallback: derive permissions from the role. Used for legacy tokens
    // issued before Issue #230 landed (and consequently don't carry a
    // `scope` claim). Will be a no-op once such tokens roll over.
    if (!user.role) {
      throw new ForbiddenException('No role assigned to user');
    }

    const hasAll = required.every((p) =>
      this.permissionsService.hasPermission(user.role, p),
    );

    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
