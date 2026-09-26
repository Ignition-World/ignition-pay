import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyExpirationService } from './api-key-expiration.service';

/**
 * Guard to protect API routes with API keys.
 *
 * Supports zero-downtime rotation: during the rotation grace period,
 * both the old key (marked with rotationOfId + rotationExpiresAt) and
 * the new key are accepted as valid.
 *
 * The key is sent in the x-api-key header, hashed (SHA-256), and compared
 * against the database. If valid, the user information is attached to the
 * request object for use in the route handlers.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expirationService: ApiKeyExpirationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: unknown }>();

    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    // Find by keyHash only (not filtering by isActive yet)
    // We need to check both active keys and keys in rotation grace period
    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: { select: { id: true, walletAddress: true, role: true } },
      },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid API key');
    }

    // If the key is flagged as the old key in a rotation, we need to check:
    // 1. It has rotationOfId set (it's the old key)
    // 2. The rotation grace period hasn't expired yet
    if (record.rotationOfId && record.rotationExpiresAt) {
      if (record.rotationExpiresAt <= new Date()) {
        // Grace period has expired, auto-revoke this old key
        await this.prisma.apiKey.update({
          where: { id: record.id },
          data: { isActive: false },
        });
        throw new UnauthorizedException(
          'API key rotation grace period has expired. Use your new key.',
        );
      }
      // Otherwise, the old key is still valid during the grace period
    } else if (!record.isActive) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Check regular expiration
    if (record.expiresAt && record.expiresAt <= new Date()) {
      await this.prisma.apiKey.update({
        where: { id: record.id },
        data: { isActive: false },
      });
      throw new UnauthorizedException('API key has expired');
    }

    await this.expirationService.touchUsage(record.id);

    request.user = {
      id: record.user.id,
      walletAddress: record.user.walletAddress,
      role: record.user.role,
      apiKeyId: record.id,
      scope: record.scope,
    };

    return true;
  }
}
