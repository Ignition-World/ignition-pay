import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Enforces the upper bound on the `limit` query parameter for GET /transactions (Issue #417).
 * Complements the @Max(100) class-validator decorator by providing an explicit
 * guard that returns a descriptive error before the handler is reached.
 */
export const MAX_TRANSACTION_LIMIT = 100;

@Injectable()
export class TransactionLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ query?: { limit?: string } }>();
    const raw = request.query?.limit;
    if (raw !== undefined) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed > MAX_TRANSACTION_LIMIT || parsed < 1) {
        throw new BadRequestException(
          `limit must be between 1 and ${MAX_TRANSACTION_LIMIT}`,
        );
      }
    }
    return true;
  }
}