import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DEDUP_WINDOW_MS,
  NotificationDedupStore,
  PENDING_MARKER,
} from './notification-dedup.store';

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  pttl: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

function makeStore(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { NODE_ENV: 'test', ...overrides };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;

  return new NotificationDedupStore(config);
}

describe('NotificationDedupStore (#623)', () => {
  beforeEach(() => {
    // mockReset, not clearAllMocks: a test that stops scanning early leaves an
    // unconsumed mockResolvedValueOnce behind, which would then be served to the
    // next test. Resetting each redis method clears those queues too. The module
    // factory's own mock is left alone so `new Redis()` keeps returning redisMock.
    for (const fn of Object.values(redisMock)) {
      fn.mockReset();
    }
  });

  describe('key()', () => {
    it('hashes userId:eventType:resourceId', () => {
      const store = makeStore();
      const key = store.key('u1', 'DONATION_RECEIVED', 'c1');

      // Namespaced by environment, then a sha256 hex digest.
      expect(key).toMatch(/^notif-dedup:test:[0-9a-f]{64}$/);
    });

    it('is stable for the same triple and different for any change', () => {
      const store = makeStore();
      const base = store.key('u1', 'DONATION_RECEIVED', 'c1');

      expect(store.key('u1', 'DONATION_RECEIVED', 'c1')).toBe(base);
      expect(store.key('u2', 'DONATION_RECEIVED', 'c1')).not.toBe(base);
      expect(store.key('u1', 'MILESTONE_REACHED', 'c1')).not.toBe(base);
      expect(store.key('u1', 'DONATION_RECEIVED', 'c2')).not.toBe(base);
    });

    it('keeps user and resource ids out of the key', () => {
      const store = makeStore();
      const key = store.key('user-secret-id', 'DONATION_RECEIVED', 'campaign-42');

      expect(key).not.toContain('user-secret-id');
      expect(key).not.toContain('campaign-42');
    });
  });

  describe('window configuration', () => {
    it('defaults to one hour', () => {
      expect(makeStore().windowMs).toBe(DEFAULT_DEDUP_WINDOW_MS);
      expect(DEFAULT_DEDUP_WINDOW_MS).toBe(60 * 60 * 1000);
    });

    it('is configurable', () => {
      expect(makeStore({ NOTIFICATION_DEDUP_WINDOW_MS: 5000 }).windowMs).toBe(5000);
    });
  });

  describe('claim()', () => {
    it('writes with NX and a TTL matching the window', async () => {
      redisMock.set.mockResolvedValue('OK');
      const store = makeStore();

      const result = await store.claim('k');

      expect(result).toEqual({ claimed: true });
      expect(redisMock.set).toHaveBeenCalledWith(
        'k',
        PENDING_MARKER,
        'PX',
        DEFAULT_DEDUP_WINDOW_MS,
        'NX',
      );
    });

    it('reports the stored value when the key is already held', async () => {
      redisMock.set.mockResolvedValue(null);
      redisMock.get.mockResolvedValue('notification-1');
      const store = makeStore();

      expect(await store.claim('k')).toEqual({
        claimed: false,
        existing: 'notification-1',
      });
    });

    it('fails open when Redis is unreachable', async () => {
      redisMock.set.mockRejectedValue(new Error('ECONNREFUSED'));
      const store = makeStore();

      // A Redis outage must not stop notifications being delivered.
      expect(await store.claim('k')).toEqual({ claimed: true });
    });
  });

  describe('recordNotificationId()', () => {
    it('overwrites the marker without extending the window', async () => {
      redisMock.set.mockResolvedValue('OK');
      const store = makeStore();

      await store.recordNotificationId('k', 'n1');

      // KEEPTTL is the point: refreshing the expiry would let a trickle of
      // duplicates hold the window open forever.
      expect(redisMock.set).toHaveBeenCalledWith('k', 'n1', 'KEEPTTL', 'XX');
    });

    it('swallows a Redis failure', async () => {
      redisMock.set.mockRejectedValue(new Error('down'));
      const store = makeStore();

      await expect(store.recordNotificationId('k', 'n1')).resolves.toBeUndefined();
    });
  });

  describe('entries()', () => {
    it('scans rather than using KEYS, and reports the remaining TTL', async () => {
      redisMock.scan.mockResolvedValue(['0', ['notif-dedup:test:aa']]);
      redisMock.get.mockResolvedValue('n1');
      redisMock.pttl.mockResolvedValue(1234);
      const store = makeStore();

      expect(await store.entries()).toEqual([
        { key: 'notif-dedup:test:aa', value: 'n1', ttlMs: 1234 },
      ]);
      expect(redisMock.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'notif-dedup:test:*',
        'COUNT',
        100,
      );
    });

    it('honours the limit across scan pages', async () => {
      redisMock.scan
        .mockResolvedValueOnce(['1', ['notif-dedup:test:a', 'notif-dedup:test:b']])
        .mockResolvedValueOnce(['0', ['notif-dedup:test:c']]);
      redisMock.get.mockResolvedValue(PENDING_MARKER);
      redisMock.pttl.mockResolvedValue(10);
      const store = makeStore();

      expect(await store.entries(2)).toHaveLength(2);
    });
  });

  describe('clear()', () => {
    it('deletes only this environment prefix and counts the removals', async () => {
      // Driven by an implementation rather than queued values, so a page the
      // store does not fetch cannot leak into the next test.
      const pages: Array<[string, string[]]> = [
        ['1', ['notif-dedup:test:a', 'notif-dedup:test:b']],
        ['0', ['notif-dedup:test:c']],
      ];
      let page = 0;
      redisMock.scan.mockImplementation(() => Promise.resolve(pages[page++]));
      redisMock.del.mockImplementation((...keys: string[]) =>
        Promise.resolve(keys.length),
      );
      const store = makeStore();

      expect(await store.clear()).toBe(3);
      expect(redisMock.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'notif-dedup:test:*',
        'COUNT',
        100,
      );
      expect(redisMock.del).toHaveBeenCalledTimes(2);
    });

    it('returns zero when nothing is cached', async () => {
      redisMock.scan.mockImplementation(() => Promise.resolve(['0', []]));
      redisMock.del.mockImplementation(() => Promise.resolve(0));
      const store = makeStore();

      expect(await store.clear()).toBe(0);
      expect(redisMock.del).not.toHaveBeenCalled();
    });
  });

  describe('release()', () => {
    it('deletes the key so a retry is not suppressed', async () => {
      redisMock.del.mockResolvedValue(1);
      const store = makeStore();

      await store.release('k');

      expect(redisMock.del).toHaveBeenCalledWith('k');
    });
  });

  it('disconnects on shutdown', () => {
    const store = makeStore();
    store.onModuleDestroy();

    expect(redisMock.disconnect).toHaveBeenCalled();
  });
});
