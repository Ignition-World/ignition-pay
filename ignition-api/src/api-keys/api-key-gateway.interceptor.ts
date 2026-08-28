import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
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
 * ApiKeyScopeInterceptor — gateway-level scope enforcement.
 *
 * Problem (#437): `ApiKeyScopeGuard` is decorator-based, so a route that
 * forgets `@RequireScope(...)` silently lets any authenticated API key
 * through without a scope check.
 *
 * This interceptor runs **globally** (registered via APP_INTERCEPTOR in
 * AppModule). It complements `ApiKeyScopeGuard` by enforcing the inverse:
 *
 *   - If the incoming request was authenticated with an API key
 *     (`request.user.apiKeyId` is populated by `ApiKeyGuard`), and
 *   - The target handler has **no** `@RequireScope(...)` metadata,
 *
 * the request is rejected with 403 Forbidden.  This means every route that
 * accepts API key credentials must explicitly declare its required scope.
 * Routes that use JWT auth or have no auth at all are unaffected.
 *
 * Execution order:
 *   ApiKeyGuard → ApiKeyScopeGuard (per-route, existing) →
 *   ApiKeyScopeInterceptor (global, this file) → handler
 *
 * In practice, `ApiKeyGuard` + `ApiKeyScopeGuard` remain on each controller
 * method so that scope is enforced both by the guard (before the handler
 * runs) and, as a safety net, by this interceptor (which catches any route
 * where a developer forgot to add the decorator).
 */
@Injectable()
export class ApiKeyScopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: ApiKeyUser }>();

    const user = request.user;

    // Not an API key request — nothing to enforce here.
    // JWT-authenticated requests and unauthenticated public routes pass freely.
    if (!user?.apiKeyId) {
      return next.handle();
    }

    // The request was authenticated with an API key.
    // Ensure the handler has an explicit @RequireScope declaration.
    const declaredScopes = this.reflector.getAllAndOverride<
      ApiKeyScope[] | undefined
    >(API_KEY_SCOPE_KEY, [context.getHandler(), context.getClass()]);

    if (!declaredScopes || declaredScopes.length === 0) {
      throw new ForbiddenException(
        'This route does not declare a required API key scope. ' +
          'Add @RequireScope(...) to the route handler or controller to allow API key access.',
      );
    }

    return next.handle();
  }
}
