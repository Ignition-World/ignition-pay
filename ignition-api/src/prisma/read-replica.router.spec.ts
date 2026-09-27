import { resolveReplicaConfig } from './replica.config';
import { ReadReplicaRouter } from './read-replica.router';

type FakeClient = {
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  calls: number;
};

function fakeClient(connectImpl?: () => Promise<void>): FakeClient {
  return {
    $connect: jest.fn(connectImpl ?? (() => Promise.resolve())),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    calls: 0,
  };
}

describe('resolveReplicaConfig', () => {
  it('keeps the existing single-database deployment working (no replica vars)', () => {
    const config = resolveReplicaConfig({
      DATABASE_URL: 'postgresql://u:p@primary:5432/db',
    });

    expect(config).toEqual({
      primaryUrl: 'postgresql://u:p@primary:5432/db',
      replicaUrl: undefined,
      replicaEnabled: false,
    });
  });

  it('prefers DATABASE_PRIMARY_URL when it is set', () => {
    const config = resolveReplicaConfig({
      DATABASE_URL: 'postgresql://u:p@primary:5432/db',
      DATABASE_PRIMARY_URL: 'postgresql://u:p@explicit-primary:5432/db',
    });

    expect(config.primaryUrl).toBe('postgresql://u:p@explicit-primary:5432/db');
    expect(config.replicaEnabled).toBe(false);
  });

  it('enables the replica when DATABASE_REPLICA_URL is set', () => {
    const config = resolveReplicaConfig({
      DATABASE_URL: 'postgresql://u:p@primary:5432/db',
      DATABASE_REPLICA_URL: 'postgresql://u:p@replica:5432/db',
    });

    expect(config).toEqual({
      primaryUrl: 'postgresql://u:p@primary:5432/db',
      replicaUrl: 'postgresql://u:p@replica:5432/db',
      replicaEnabled: true,
    });
  });

  it('treats a blank DATABASE_REPLICA_URL as disabled', () => {
    const config = resolveReplicaConfig({
      DATABASE_URL: 'postgresql://u:p@primary:5432/db',
      DATABASE_REPLICA_URL: '   ',
    });

    expect(config.replicaEnabled).toBe(false);
    expect(config.replicaUrl).toBeUndefined();
  });

  it('refuses to open a second client against the primary', () => {
    const url = 'postgresql://u:p@primary:5432/db';
    const config = resolveReplicaConfig({
      DATABASE_URL: url,
      DATABASE_REPLICA_URL: url,
    });

    expect(config.replicaEnabled).toBe(false);
  });

  it('yields an empty primary url when nothing is configured at all', () => {
    expect(resolveReplicaConfig({}).primaryUrl).toBe('');
  });
});

describe('ReadReplicaRouter', () => {
  describe('when no replica is configured', () => {
    it('routes every read to the primary', () => {
      const primary = fakeClient();
      const router = new ReadReplicaRouter(primary, null);

      expect(router.isReplicaUsable()).toBe(false);
      expect(router.getReadClient()).toBe(primary);
    });

    it('reports itself disabled', () => {
      const router = new ReadReplicaRouter(fakeClient(), null);

      expect(router.getStatus()).toMatchObject({
        enabled: false,
        inUse: false,
        healthy: false,
        lastCheckedAt: null,
      });
    });
  });

  describe('when a replica is configured and healthy', () => {
    it('routes reads to the replica', () => {
      const primary = fakeClient();
      const replica = fakeClient();
      const router = new ReadReplicaRouter(primary, replica);

      expect(router.isReplicaUsable()).toBe(true);
      expect(router.getReadClient()).toBe(replica);
      expect(router.getStatus()).toMatchObject({
        enabled: true,
        inUse: true,
        healthy: true,
      });
    });

    it('runs the read against the replica', async () => {
      const primary = fakeClient();
      const replica = fakeClient();
      const router = new ReadReplicaRouter(primary, replica);
      const read = jest.fn().mockResolvedValue(['row']);

      await expect(router.withReadReplica(read)).resolves.toEqual(['row']);
      expect(read).toHaveBeenCalledWith(replica);
    });
  });

  describe('failover', () => {
    it('retries the read on the primary when the replica fails mid-flight', async () => {
      const primary = fakeClient();
      const replica = fakeClient();
      const router = new ReadReplicaRouter(primary, replica);

      const read = jest
        .fn()
        .mockRejectedValueOnce(new Error('replica unreachable'))
        .mockResolvedValueOnce(['row-from-primary']);

      // The read must not fail just because the replica is down.
      await expect(router.withReadReplica(read)).resolves.toEqual([
        'row-from-primary',
      ]);
      expect(read).toHaveBeenNthCalledWith(1, replica);
      expect(read).toHaveBeenNthCalledWith(2, primary);
    });

    it('takes the replica out of rotation for the cooldown window', async () => {
      const primary = fakeClient();
      const replica = fakeClient();
      const router = new ReadReplicaRouter(primary, replica, {
        cooldownMs: 30_000,
      });

      await router
        .withReadReplica(jest.fn().mockRejectedValue(new Error('down')))
        .catch(() => undefined);

      expect(router.isReplicaUsable()).toBe(false);
      expect(router.getReadClient()).toBe(primary);
      expect(router.getStatus()).toMatchObject({
        inUse: false,
        healthy: false,
        consecutiveFailures: 1,
        lastError: 'down',
      });
      expect(router.getStatus().cooldownRemainingMs).toBeGreaterThan(0);
    });

    it('stops paying the failing replica path until the cooldown expires', async () => {
      const primary = fakeClient();
      const replica = fakeClient();
      let clock = 1_000_000;
      const router = new ReadReplicaRouter(primary, replica, {
        cooldownMs: 5_000,
        now: () => clock,
      });

      await router
        .withReadReplica(jest.fn().mockRejectedValue(new Error('down')))
        .catch(() => undefined);

      // Inside the cooldown: straight to the primary, no second replica try.
      const duringCooldown = jest.fn().mockResolvedValue('primary');
      await router.withReadReplica(duringCooldown);
      expect(duringCooldown).toHaveBeenCalledTimes(1);
      expect(duringCooldown).toHaveBeenCalledWith(primary);

      // After the cooldown elapses, reads go back to the replica.
      clock += 5_000;
      const afterCooldown = jest.fn().mockResolvedValue('replica');
      await router.withReadReplica(afterCooldown);
      expect(afterCooldown).toHaveBeenCalledWith(replica);
    });

    it('propagates the error when the primary also fails', async () => {
      const primary = fakeClient();
      const replica = fakeClient();
      const router = new ReadReplicaRouter(primary, replica);

      await expect(
        router.withReadReplica(
          jest.fn().mockRejectedValue(new Error('both down')),
        ),
      ).rejects.toThrow('both down');
    });

    it('resets the failure counter after a successful replica read', async () => {
      const primary = fakeClient();
      const replica = fakeClient();
      const router = new ReadReplicaRouter(primary, replica, {
        cooldownMs: 0,
      });

      await router
        .withReadReplica(jest.fn().mockRejectedValue(new Error('down')))
        .catch(() => undefined);
      await router.withReadReplica(jest.fn().mockResolvedValue('ok'));

      expect(router.getStatus()).toMatchObject({
        consecutiveFailures: 0,
        lastError: null,
        healthy: true,
      });
      expect(router.getStatus().lastCheckedAt).not.toBeNull();
    });
  });

  describe('pingReplica', () => {
    it('reports healthy on a successful connect', async () => {
      const router = new ReadReplicaRouter(fakeClient(), fakeClient());

      await expect(router.pingReplica()).resolves.toBe(true);
      expect(router.getStatus()).toMatchObject({ healthy: true, inUse: true });
    });

    it('reports unhealthy and opens the cooldown when the replica cannot connect', async () => {
      const replica = fakeClient(() =>
        Promise.reject(new Error('ECONNREFUSED')),
      );
      const router = new ReadReplicaRouter(fakeClient(), replica);

      await expect(router.pingReplica()).resolves.toBe(false);
      expect(router.getStatus()).toMatchObject({
        enabled: true,
        healthy: false,
        inUse: false,
        lastError: 'ECONNREFUSED',
      });
    });

    it('returns false when no replica is configured', async () => {
      const router = new ReadReplicaRouter(fakeClient(), null);

      await expect(router.pingReplica()).resolves.toBe(false);
    });

    it('rate-limits probes so a poll storm cannot become a connection storm', async () => {
      const replica = fakeClient();
      let clock = 0;
      const router = new ReadReplicaRouter(fakeClient(), replica, {
        probeIntervalMs: 5_000,
        now: () => clock,
      });

      await router.pingReplica();
      await router.pingReplica();
      expect(replica.$connect).toHaveBeenCalledTimes(1);

      clock += 5_000;
      await router.pingReplica();
      expect(replica.$connect).toHaveBeenCalledTimes(2);
    });
  });
});
