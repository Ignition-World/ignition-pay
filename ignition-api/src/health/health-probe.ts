import { Logger } from '@nestjs/common';

/**
 * Default per-dependency probe budget. A dependency that has not answered
 * within this window is reported as down; the HTTP request is never held open
 * waiting for a hung socket.
 */
export const DEFAULT_DEPENDENCY_TIMEOUT_MS = 3_000;

/**
 * How many consecutive failures a dependency may produce before it is
 * reported as `down` (which is what flips the endpoint to 503). Below the
 * threshold the endpoint stays 200 and the dependency is reported
 * `degraded`, so a single Redis blip does not pull a pod out of a load
 * balancer.
 */
export const DEFAULT_FAILURE_THRESHOLD = 3;

export class DependencyTimeoutError extends Error {
  constructor(
    readonly key: string,
    readonly timeoutMs: number,
  ) {
    super(`Health check "${key}" did not answer within ${timeoutMs}ms`);
    this.name = 'DependencyTimeoutError';
  }
}

const logger = new Logger('HealthProbe');

/** Reject if `work` has not settled within `timeoutMs`. */
export function withTimeout<T>(
  key: string,
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DependencyTimeoutError(key, timeoutMs)),
      timeoutMs,
    );
    timer.unref();
  });

  // If the timeout wins the race, the underlying probe can still reject later
  // and Node would surface that as an unhandled rejection. Attaching a handler
  // here does not change what `race` observes; it only stops the stray
  // rejection from crashing the process.
  work.catch(() => undefined);

  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export interface DependencyProbeRecord {
  latencyMs: number;
  /** ISO timestamp of when this probe completed. */
  lastCheckedAt: string;
  consecutiveFailures: number;
  failureThreshold: number;
}

export interface DependencyFailure extends DependencyProbeRecord {
  /** True while the failure count is still under the threshold. */
  tolerated: boolean;
  error: string;
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * In-memory per-dependency probe bookkeeping. Feeds the `latencyMs` and
 * `lastCheckedAt` fields on the health payload and decides when a run of
 * failures is allowed to mark a dependency down.
 *
 * State is per-process and intentionally not persisted: a restarted pod starts
 * with a clean slate, which is the conservative direction (it has to observe
 * fresh failures before reporting down).
 */
export class DependencyHealthRegistry {
  private readonly records = new Map<string, DependencyProbeRecord>();

  constructor(private readonly failureThreshold: number) {}

  recordSuccess(key: string, latencyMs: number): DependencyProbeRecord {
    const record: DependencyProbeRecord = {
      latencyMs,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      failureThreshold: this.failureThreshold,
    };
    this.records.set(key, record);
    return record;
  }

  recordFailure(
    key: string,
    latencyMs: number,
    error: unknown,
  ): DependencyFailure {
    const previous = this.records.get(key);
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    const record: DependencyFailure = {
      latencyMs,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures,
      failureThreshold: this.failureThreshold,
      tolerated: consecutiveFailures < this.failureThreshold,
      error: describeError(error),
    };
    this.records.set(key, record);
    return record;
  }

  get(key: string): DependencyProbeRecord | undefined {
    return this.records.get(key);
  }

  getAll(): Record<string, DependencyProbeRecord> {
    return Object.fromEntries(this.records.entries());
  }
}
