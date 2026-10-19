import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    // Issue #774 — scope says *what* a key may do, not *which* resources it
    // may touch.
    await this.assertResourceOwnership(request, user, keyScope);

    return true;
  }

  /**
   * Issue #774 — reject a request that targets a wallet the key's owner does
   * not hold.
   *
   * Before this, a `read` key could point the API at any wallet and read that
   * wallet's balance and recent payments (`GET /wallets/:id/balance`), i.e.
   * enumerate balances across wallets the key was never granted.
   *
   * The wallet named by the request is resolved against the wallets the key's
   * owner actually holds. A request that names no wallet, or names something
   * that is not a wallet at all, is left to the route to handle.
   */
  private async assertResourceOwnership(
    request: Request & { user?: ApiKeyUser },
    user: ApiKeyUser,
    keyScope: ApiKeyScope,
  ): Promise<void> {
    // `admin` is the platform-wide scope - it is not bound to one owner.
    if (keyScope === 'admin') return;

    // Without an owner id there is nothing to compare against.
    if (!user.id) return;

    const params = request.params as Record<string, unknown> | undefined;
    const query = request.query as Record<string, unknown> | undefined;
    const body = request.body as Record<string, unknown> | undefined;

    const candidate =
      params?.walletId ?? params?.id ?? query?.walletId ?? body?.walletId;

    const requested = typeof candidate === 'string' ? candidate : undefined;
    if (!requested) return;

    const wallet = await this.prisma.wallet.findFirst({
      where: { OR: [{ id: requested }, { depositAddress: requested }] },
      select: { id: true, userId: true },
    });

    // Not a wallet resource - the route decides what to do with it.
    if (!wallet) return;

    if (wallet.userId !== user.id) {
      throw new ForbiddenException(
        'This API key is not authorized for the requested wallet.',
      );
    }
  }
}
