import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  API_KEY_SCOPE_KEY,
  ApiKeyScope,
} from './decorators/require-scope.decorator';

interface ApiKeyUser {
  id: string;
  walletAddress: string | null;
  role: string;
  apiKeyId: string;
  scope: string;
}

/**
 * Scope precedence: admin > write > read
 * An API key with a higher scope satisfies lower-scope requirements.
 */
const SCOPE_RANK: Record<ApiKeyScope, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

/**
 * ApiKeyScopeGuard
 *
 * Must be used **after** ApiKeyGuard (which populates `request.user` with
 * the resolved scope). When the route or controller is decorated with
 * `@RequireScope(...)`, this guard verifies that the API key's scope meets
 * or exceeds the required level.
 *
 * If no `@RequireScope` decorator is present the guard passes through, so it
 * is safe to apply globally or at the module level.
 *
 * @example
 * // At the controller level
 * @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
 * @RequireScope('write')
 * @Controller('transactions')
 * export class TransactionsController {}
 */
@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(
      API_KEY_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No scope requirement — pass through
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: ApiKeyUser }>();

    const user = request.user;

    const requiredScopeDescription = requiredScopes.join(' or ');

    if (!user || !user.scope) {
      throw new ForbiddenException(
        `API key is missing a scope. Required: ${requiredScopeDescription}.`,
      );
    }

    const keyScope = user.scope as ApiKeyScope;
    const keyRank = SCOPE_RANK[keyScope] ?? 0;

    const hasRequiredScope = requiredScopes.some(
      (required) => keyRank >= (SCOPE_RANK[required] ?? Infinity),
    );

    if (!hasRequiredScope) {
      throw new ForbiddenException(
        `API key scope '${keyScope}' is insufficient. ` +
          `Required: ${requiredScopeDescription}.`,
      );
    }

    return true;
  }
}
