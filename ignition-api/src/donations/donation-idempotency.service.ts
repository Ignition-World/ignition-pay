import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';

const TTL_SECONDS = 24 * 60 * 60;

/**
 * Makes `POST /donations` safe to retry. The client sends an `Idempotency-Key`
 * header; the first request with a key (per user) claims it, and a repeat is
 * rejected so it cannot create a second donation or payment intent.
 */
@Injectable()
export class DonationIdempotencyService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  /** Claims `key` for `userId`; throws 409 if it was already used. */
  async claim(userId: string, key: string): Promise<void> {
    if (!key || key.length > 128) {
      throw new ConflictException('A valid Idempotency-Key header is required');
    }
    const claimed = await this.redis.set(`idem:donation:${userId}:${key}`, '1', 'EX', TTL_SECONDS, 'NX');
    if (claimed !== 'OK') {
      throw new ConflictException('This donation request was already submitted');
    }
  }
}
