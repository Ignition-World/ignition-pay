import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IdempotencyService,
  hashIdempotencyKey,
  isValidIdempotencyKey,
  IDEMPOTENCY_TTL_MS,
} from './idempotency.service';

// ---------------------------------------------------------------------------
// Fake Redis with real `SET ... NX` semantics
// ---------------------------------------------------------------------------

const buildRedisDouble = () => {
  const store = new Map<string, { value: string; px: number }>();

  const set = jest.fn(
    async (
      key: string,
      value: string,
      _expiry: 'PX',
      px: number,
      nx?: 'NX',
    ) => {
      if (nx === 'NX' && store.has(key)) {
        return null;
      }
      store.set(key, { value, px });
      return 'OK';
    },
  );

  const client = {
    set,
    get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    disconnect: jest.fn(),
  };

  return { client, store, set };
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => globalThis.__redisDouble.client),
}));

const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_KEY = '9c858901-8a57-4791-81fe-4c455b099bc9';

function buildService(
  overrides: Record<string, unknown> = {},
): { service: IdempotencyService; redis: ReturnType<typeof buildRedisDouble> } {
  const redis = buildRedisDouble();
  (globalThis as any).__redisDouble = redis;

  const config = {
    get: jest.fn((key: string, fallback: unknown) =>
      key in overrides ? overrides[key] : fallback,
    ),
  } as unknown as ConfigService;

  return { service: new IdempotencyService(config), redis };
}

// ---------------------------------------------------------------------------
// Key format + hashing
// ---------------------------------------------------------------------------

describe('isValidIdempotencyKey', () => {
  it.each([
    ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', true],
    ['3F2504E0-4F89-41D3-9A0C-0305E82C3301', true],
    ['3f2504e0-4f89-41d3-9a0c-0305e82c3302', true],
  ])('accepts %s', (key, expected) => {
    expect(isValidIdempotencyKey(key)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['arbitrary string', 'abc123'],
    ['uuid v1', '3f2504e0-1f89-11d3-9a0c-0305e82c3301'],
    ['no hyphens', '3f2504e04f8941d39a0c0305e82c3301'],
    ['wrong variant nibble', '3f2504e0-4f89-41d3-2a0c-0305e82c3301'],
    ['truncated', '3f2504e0-4f89-41d3-9a0c'],
  ])('rejects %s', (_label, key) => {
    expect(isValidIdempotencyKey(key)).toBe(false);
  });
});

describe('hashIdempotencyKey', () => {
  it('is a 64-character sha256 hex digest', () => {
    expect(hashIdempotencyKey(KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable and key-specific', () => {
    expect(hashIdempotencyKey(KEY)).toBe(hashIdempotencyKey(KEY));
    expect(hashIdempotencyKey(KEY)).not.toBe(hashIdempotencyKey(OTHER_KEY));
  });

  it('never contains the raw key', () => {
    expect(hashIdempotencyKey(KEY)).not.toContain(KEY);
  });
});

// ---------------------------------------------------------------------------
// claim / complete / release
// ---------------------------------------------------------------------------

describe('IdempotencyService', () => {
  it('stores only the digest, never the raw key, as the Redis key', async () => {
    const { service, redis } = buildService();

    await service.claim(KEY);

    const storedKeys = [...redis.store.keys()];
    expect(storedKeys).toHaveLength(1);
    expect(storedKeys[0]).not.toContain(KEY);
    expect(storedKeys[0]).toContain(hashIdempotencyKey(KEY));
    expect(service.storageKey(KEY)).toBe(storedKeys[0]);
  });

  it('uses SET with PX 24h and NX, i.e. a single atomic command', async () => {
    const { service, redis } = buildService();

    await service.claim(KEY);

    expect(redis.set).toHaveBeenCalledWith(
      service.storageKey(KEY),
      expect.any(String),
      'PX',
      IDEMPOTENCY_TTL_MS,
      'NX',
    );
    expect(IDEMPOTENCY_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('grants the claim to exactly one of two concurrent callers', async () => {
    const { service } = buildService({
      IDEMPOTENCY_WAIT_TIMEOUT_MS: 30,
      IDEMPOTENCY_POLL_INTERVAL_MS: 5,
    });

    const winner = service.claim(KEY);
    const loser = service.claim(KEY);

    await expect(winner).resolves.toEqual({ status: 'claimed' });
    // The loser never gets a claim of its own; it is told the original is
    // still running rather than being allowed to execute a second time.
    await expect(loser).rejects.toThrow(ConflictException);
  });

  it('replays the stored response for a repeat claim', async () => {
    const { service } = buildService();
    const response = { id: 'txn-1', createdAt: new Date('2026-01-15T10:00:00Z') };

    await service.claim(KEY);
    await service.complete(KEY, response);
    const second = await service.claim(KEY);

    expect(second).toEqual({ status: 'replayed', response });
  });

  it('round-trips Date values so a replayed response keeps its shape', async () => {
    const { service } = buildService();
    const response = {
      id: 'txn-1',
      createdAt: new Date('2026-01-15T10:00:00.000Z'),
      nested: { updatedAt: new Date('2026-01-15T10:00:05.000Z') },
    };

    await service.claim(KEY);
    await service.complete(KEY, response);
    const second = (await service.claim(KEY)) as {
      status: string;
      response: typeof response;
    };

    expect(second.response.createdAt).toBeInstanceOf(Date);
    expect(second.response.createdAt.toISOString()).toBe(
      '2026-01-15T10:00:00.000Z',
    );
    expect(second.response.nested.updatedAt).toBeInstanceOf(Date);
  });

  it('keeps different keys independent', async () => {
    const { service } = buildService();

    await service.claim(KEY);
    await service.complete(KEY, { id: 'txn-1' });
    const other = await service.claim(OTHER_KEY);

    expect(other).toEqual({ status: 'claimed' });
  });

  it('release() frees the key so the next claim succeeds', async () => {
    const { service } = buildService();

    await service.claim(KEY);
    await service.complete(KEY, { id: 'txn-1' });
    await service.release(KEY);
    const afterRelease = await service.claim(KEY);

    expect(afterRelease).toEqual({ status: 'claimed' });
  });

  it('release() on an unknown key is a no-op', async () => {
    const { service, redis } = buildService();
    await expect(service.release(KEY)).resolves.toBeUndefined();
    expect(redis.del).toHaveBeenCalledWith(service.storageKey(KEY));
  });

  it('throws 409 when the original request is still in flight past the wait budget', async () => {
    const { service } = buildService({
      IDEMPOTENCY_WAIT_TIMEOUT_MS: 30,
      IDEMPOTENCY_POLL_INTERVAL_MS: 5,
    });

    await service.claim(KEY);
    await expect(service.claim(KEY)).rejects.toThrow(ConflictException);
  });

  it('a claim that loses the race replays once the winner completes', async () => {
    const { service } = buildService({
      IDEMPOTENCY_WAIT_TIMEOUT_MS: 500,
      IDEMPOTENCY_POLL_INTERVAL_MS: 5,
    });

    const winner = await service.claim(KEY);
    expect(winner).toEqual({ status: 'claimed' });

    const loser = service.claim(KEY);
    // Publish the result while the loser is still polling.
    await service.complete(KEY, { id: 'txn-1' });

    await expect(loser).resolves.toEqual({
      status: 'replayed',
      response: { id: 'txn-1' },
    });
  });

  it('re-claims when the record disappears between the failed SET and the read', async () => {
    const { service, redis } = buildService();

    // Simulate the record expiring (or being released) in the gap between the
    // failed `SET ... NX` and the follow-up read: the first NX attempt fails and
    // the record vanishes, so the second attempt can claim it.
    redis.set.mockImplementationOnce(
      async (key: string, value: string, _expiry: 'PX', px: number, nx?: 'NX') => {
        if (nx === 'NX' && redis.store.has(key)) {
          redis.store.delete(key);
          return null;
        }
        redis.store.set(key, { value, px });
        return 'OK';
      },
    );
    redis.store.set(service.storageKey(KEY), {
      value: JSON.stringify({ state: 'in_flight' }),
      px: IDEMPOTENCY_TTL_MS,
    });

    await expect(service.claim(KEY)).resolves.toEqual({ status: 'claimed' });
  });

  it('disconnects Redis on module destroy', () => {
    const { service, redis } = buildService();
    service.onModuleDestroy();
    expect(redis.client.disconnect).toHaveBeenCalled();
  });
});
