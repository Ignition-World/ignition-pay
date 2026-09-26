import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { AddressGenerationThrottleMonitorService } from './address-generation-throttle-monitor.service';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  constructor(
    private readonly addressGenerationThrottleMonitorService: AddressGenerationThrottleMonitorService,
  ) {
    super();
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const rawIp =
      req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      req.headers['x-forwarded-for'] ||
      req.ip ||
      req.socket?.remoteAddress;

    if (typeof rawIp === 'string') {
      const parts = rawIp.split(',').map((ip: string) => ip.trim());
      return parts[0];
    }
    return req.ip || '127.0.0.1';
  }

  async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttlerName: string,
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tracker = await this.getTracker(req);
    const key = `${throttlerName}:${tracker}`;
    const { totalHits, isBlocked } = await this.storage.increment(
      key,
      ttl,
      limit,
      0,
      throttlerName,
    );

    if (req.originalUrl?.includes('/addresses/generate')) {
      await this.addressGenerationThrottleMonitorService.recordEvent({
        ip: tracker,
        endpoint: req.originalUrl,
        count: totalHits,
        limit,
        isBlocked,
        occurredAt: new Date(),
      });
    }

    if (isBlocked) {
      throw new ThrottlerException('Too Many Requests');
    }

    return true;
  }
}
