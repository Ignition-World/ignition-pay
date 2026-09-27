import { Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { AddressGenerationThrottleMonitorService } from './address-generation-throttle-monitor.service';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  private readonly jwt = new JwtService();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Optional()
    private readonly addressGenerationThrottleMonitorService?: AddressGenerationThrottleMonitorService,
  ) {
    super(options, storageService, reflector);
  }

  private clientIp(req: Record<string, any>): string {
    const rawIp =
      req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      req.headers['x-forwarded-for'] ||
      req.ip ||
      req.socket?.remoteAddress;

    if (typeof rawIp === 'string') {
      return rawIp.split(',').map((ip: string) => ip.trim())[0];
    }
    return req.ip || '127.0.0.1';
  }

  /**
   * Counters are keyed per user when the request carries a valid access
   * token, otherwise per client IP.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const authz = req.headers?.authorization;
    const secret = process.env.JWT_SECRET;
    if (secret && typeof authz === 'string' && /^Bearer\s+/i.test(authz)) {
      try {
        const payload = this.jwt.verify<{ sub?: string }>(
          authz.replace(/^Bearer\s+/i, ''),
          { secret },
        );
        if (payload?.sub) return `user:${payload.sub}`;
      } catch {
        // invalid/expired token → fall back to IP
      }
    }
    return `ip:${this.clientIp(req)}`;
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, getTracker, generateKey } =
      requestProps;
    const { req, res } = this.getRequestResponse(context);
    const name = throttler.name ?? 'default';
    const tracker = await getTracker(req, context);
    const key = generateKey(context, tracker, name);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(key, ttl, limit, blockDuration, name);

    if (req.originalUrl?.includes('/addresses/generate')) {
      await this.addressGenerationThrottleMonitorService?.recordEvent({
        ip: this.clientIp(req),
        endpoint: req.originalUrl,
        count: totalHits,
        limit,
        isBlocked,
        occurredAt: new Date(),
      });
    }

    if (isBlocked) {
      res.header('Retry-After', String(Math.max(1, Math.ceil(timeToBlockExpire))));
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    res.header('X-RateLimit-Limit', String(limit));
    res.header('X-RateLimit-Remaining', String(Math.max(0, limit - totalHits)));
    res.header('X-RateLimit-Reset', String(Math.ceil(timeToExpire)));
    return true;
  }
}
