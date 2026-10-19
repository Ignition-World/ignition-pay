import { ConflictException } from '@nestjs/common';
import { DonationIdempotencyService } from './donation-idempotency.service';

describe('DonationIdempotencyService', () => {
  const seen = new Set<string>();
  const redis = {
    set: jest.fn(async (key: string) => (seen.has(key) ? null : (seen.add(key), 'OK'))),
  };
  const service = new DonationIdempotencyService(redis as never);

  it('accepts a key once and rejects the repeat', async () => {
    await expect(service.claim('u1', 'k1')).resolves.toBeUndefined();
    await expect(service.claim('u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes keys per user and requires a key', async () => {
    await expect(service.claim('u2', 'k1')).resolves.toBeUndefined();
    await expect(service.claim('u1', '')).rejects.toBeInstanceOf(ConflictException);
  });
});
