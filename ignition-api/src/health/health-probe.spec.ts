import {
  DEFAULT_DEPENDENCY_TIMEOUT_MS,
  DEFAULT_FAILURE_THRESHOLD,
  DependencyHealthRegistry,
  DependencyTimeoutError,
  describeError,
  withTimeout,
} from './health-probe';

describe('withTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    await expect(
      withTimeout('redis', Promise.resolve('pong'), 50),
    ).resolves.toBe('pong');
  });

  it('propagates the work rejection', async () => {
    await expect(
      withTimeout('redis', Promise.reject(new Error('boom')), 50),
    ).rejects.toThrow('boom');
  });

  it('rejects with DependencyTimeoutError when the work hangs', async () => {
    const never = new Promise<void>(() => undefined);

    await expect(withTimeout('redis', never, 10)).rejects.toBeInstanceOf(
      DependencyTimeoutError,
    );
  });

  it('names the dependency and the budget in the timeout error', async () => {
    const never = new Promise<void>(() => undefined);

    await expect(withTimeout('stellar_horizon', never, 10)).rejects.toThrow(
      /stellar_horizon.*10ms/,
    );
  });

  it('defaults to a 3s per-dependency budget', () => {
    expect(DEFAULT_DEPENDENCY_TIMEOUT_MS).toBe(3000);
  });

  it('does not surface a late rejection as an unhandled rejection', async () => {
    const late = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('arrived too late')), 20),
    );

    // The timeout wins the race; the late rejection must still be absorbed.
    await expect(withTimeout('redis', late, 5)).rejects.toBeInstanceOf(
      DependencyTimeoutError,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
});

describe('describeError', () => {
  it('uses the message of an Error', () => {
    expect(describeError(new Error('nope'))).toBe('nope');
  });

  it('stringifies a non-Error throw', () => {
    expect(describeError('plain string')).toBe('plain string');
  });
});

describe('DependencyHealthRegistry', () => {
  it('records latency, timestamp and threshold on success', () => {
    const registry = new DependencyHealthRegistry(3);

    const record = registry.recordSuccess('database', 12);

    expect(record).toMatchObject({
      latencyMs: 12,
      consecutiveFailures: 0,
      failureThreshold: 3,
    });
    expect(new Date(record.lastCheckedAt).toString()).not.toBe(
      'Invalid Date',
    );
  });

  it('tolerates failures until the threshold is reached', () => {
    const registry = new DependencyHealthRegistry(3);

    expect(registry.recordFailure('redis', 5, new Error('a')).tolerated).toBe(
      true,
    );
    expect(registry.recordFailure('redis', 5, new Error('b')).tolerated).toBe(
      true,
    );
    expect(registry.recordFailure('redis', 5, new Error('c')).tolerated).toBe(
      false,
    );
  });

  it('counts consecutive failures, so a success resets the run', () => {
    const registry = new DependencyHealthRegistry(3);

    registry.recordFailure('redis', 5, new Error('a'));
    registry.recordSuccess('redis', 5);
    const afterRecovery = registry.recordFailure('redis', 5, new Error('b'));

    expect(afterRecovery.consecutiveFailures).toBe(1);
    expect(afterRecovery.tolerated).toBe(true);
  });

  it('carries the error message through to the payload', () => {
    const registry = new DependencyHealthRegistry(1);
    const failure = registry.recordFailure(
      'redis',
      5,
      new Error('ECONNRESET'),
    );

    expect(failure.error).toBe('ECONNRESET');
  });

  it('exposes the last record for a dependency', () => {
    const registry = new DependencyHealthRegistry(3);
    registry.recordSuccess('database', 7);

    expect(registry.get('database')).toMatchObject({ latencyMs: 7 });
    expect(registry.get('nope')).toBeUndefined();
    expect(Object.keys(registry.getAll())).toEqual(['database']);
  });

  it('defaults to tolerating three consecutive failures', () => {
    expect(DEFAULT_FAILURE_THRESHOLD).toBe(3);
  });
});
