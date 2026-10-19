import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * BalanceCheckGuard (Issue #413).
 * Documents the required locking strategy to eliminate the race condition
 * between balance check and debit. The actual debit must occur inside a
 * database transaction that holds a row-level lock on the wallet row,
 * acquired with SELECT ... FOR UPDATE.
 *
 * This guard validates the request has a walletId before the handler runs.
 */
@Injectable()
export class BalanceCheckGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ body?: { senderWalletId?: string } }>();
    if (!request.body?.senderWalletId) {
      throw new BadRequestException('senderWalletId is required');
    }
    return true;
  }
}