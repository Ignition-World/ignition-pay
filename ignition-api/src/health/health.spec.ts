import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HealthCheckError,
  HttpHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { QueueHealthIndicator } from './queue.health';
import { parsePositiveInt, PrismaService } from '../prisma/prisma.service';
import { QueryMetricsService } from '../prisma/query-metrics.service';
import { ShutdownState } from '../common/shutdown/shutdown.state';
import {
  DEFAULT_FAILURE_THRESHOLD,
  DependencyHealthRegistry,
} from './health-probe';
import { QUEUE_EMAIL } from '../queue/queue.constants';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      ping: jest.fn(),
    };
  });
});

describe('Health Module', () => {
  let controller: HealthController;
  let redisIndicator: RedisHealthIndicator;
  let mockRedisClient: any;
  let mockHealth: jest.Mocked<Pick<HealthCheckService, 'check'>>;
  let mockHttp: jest.Mocked<Pick<HttpHealthIndicator, 'pingCheck'>>;
  let mockPrismaHealth: jest.Mocked<Pick<PrismaHealthIndicator, 'pingCheck'>>;
  let mockQueueHealth: { isHealthy: jest.Mock };
  let mockPrisma: any;
  let probes: DependencyHealthRegistry;
  let shutdownState: ShutdownState;

  const buildModule = async (env: Record<string, string> = {}) => {
    mockQueueHealth = {
      isHealthy: jest.fn().mockResolvedValue({
        queue: { status: 'up', [QUEUE_EMAIL]: { status: 'up' } },
      }),
    };

    mockPrisma = {
      getPoolStatus: () => ({
        poolSize: 10,
        poolTimeoutMs: 10000,
        queueTimeoutMs: 10000,
        active: 0,
        queued: 0,
        available: 10,
        exhausted: false,
      }),
      checkReplica: jest.fn().mockResolvedValue({
        enabled: false,
        inUse: false,
        healthy: false,
        consecutiveFailures: 0,
        lastCheckedAt: null,
        lastError: null,
        cooldownRemainingMs: 0,
      }),
    };

    // Mirrors the DependencyHealthRegistry factory in health.module.ts.
    probes = new DependencyHealthRegistry(
      parsePositiveInt(env.HEALTH_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD),
    );
    shutdownState = new ShutdownState();

    return Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        RedisHealthIndicator,
        { provide: QueueHealthIndicator, useValue: mockQueueHealth },
        { provide: DependencyHealthRegistry, useValue: probes },
        { provide: ShutdownState, useValue: shutdownState },
        {
          provide: QueryMetricsService,
          useValue: { getPercentiles: () => ({}) },
        },
        { provide: HealthCheckService, useValue: mockHealth },
        { provide: HttpHealthIndicator, useValue: mockHttp },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealth },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key, def) => {
              if (key === 'REDIS_URL') return 'redis://localhost:6379';
              if (key === 'STELLAR_HORIZON_URL')
                return 'https://horizon.testnet.org';
              return env[key] ?? def;
            }),
          },
        },
      ],
    }).compile();
  };

  beforeEach(async () => {
    mockHealth = { check: jest.fn() };
    mockPrismaHealth = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };
    mockHttp = {
      pingCheck: jest
        .fn()
        .mockResolvedValue({ stellar_horizon: { status: 'up' } }),
    };

    const module: TestingModule = await buildModule();

    controller = module.get<HealthController>(HealthController);
    redisIndicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
    mockRedisClient = (redisIndicator as any).client;
  });

  describe('RedisHealthIndicator', () => {
    it('isHealthy() should return status true if ping succeeds', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      const res = await redisIndicator.isHealthy('redis');
      expect(res).toEqual({ redis: { status: 'up' } });
    });

    it('isHealthy() should throw HealthCheckError if ping fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('connection failed'));
      await expect(redisIndicator.isHealthy('redis')).rejects.toThrow(
        HealthCheckError,
      );
    });
  });

  describe('HealthController', () => {
    // Index of each dependency in the thunk array the controller hands terminus.
    const DATABASE = 0;
    const REDIS = 1;
    const HORIZON = 2;
    const POOL = 3;
    const QUEUE = 4;
    const REPLICA = 5;

    // Promises for the probes issued by the most recent check() call, in the
    // same order the controller registered them.
    let collected: Promise<any>[] = [];

    /**
     * Point the terminus mock at a controller and run its check(), executing
     * every probe exactly once.
     */
    const invokeProbes = async (target: HealthController): Promise<void> => {
      mockHealth.check.mockImplementation((indicators) => {
        collected = (indicators as any[]).map((ind) => {
          const pending = ind();
          // Attach a handler now so a rejected probe is not reported as an
          // unhandled rejection before the caller gets to it.
          pending.catch(() => undefined);
          return pending;
        });
        return Promise.resolve({ status: 'ok', info: {} }) as any;
      });

      await target.check();
    };

    /**
     * Run check() against a terminus mock that executes every thunk exactly
     * once, and return the per-dependency payloads in registration order.
     */
    const runIndicators = async (
      target: HealthController = controller,
    ): Promise<any[]> => {
      await invokeProbes(target);
      return Promise.all(collected);
    };

    /** Run a single probe and report whether it resolved or rejected. */
    const settledProbe = async (
      target: HealthController,
      index: number,
    ): Promise<{ ok: boolean; value?: any; error?: any }> => {
      await invokeProbes(target);
      return collected[index].then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
    };

    it('check() should call health.check', async () => {
      mockHealth.check.mockImplementation((indicators) => {
        // Execute the mock indicators
        indicators.forEach((ind: any) => ind());
        return { status: 'ok', info: {} } as any;
      });

      const res = await controller.check();

      expect(mockHealth.check).toHaveBeenCalled();
      expect(mockPrismaHealth.pingCheck).toHaveBeenCalled();
      expect(mockHttp.pingCheck).toHaveBeenCalled();
      expect(res).toEqual({ status: 'ok', info: {} });
    });

    it('ready() should call check()', async () => {
      const checkSpy = jest
        .spyOn(controller, 'check')
        .mockResolvedValue({ status: 'ok' } as any);
      const res = await controller.ready();
      expect(checkSpy).toHaveBeenCalled();
      expect(res).toEqual({ status: 'ok' });
    });

    it('pool() should return database connection pool status', () => {
      const res = controller.pool();
      expect(res).toMatchObject({
        poolSize: 10,
        active: 0,
        exhausted: false,
      });
    });

    it('replica() should return read replica status', async () => {
      const res = await controller.replica();
      expect(res).toMatchObject({ enabled: false });
    });

    it('registers one probe per dependency', async () => {
      await runIndicators();

      expect(mockHealth.check.mock.calls[0][0]).toHaveLength(6);
    });

    it('checks the queue manager, which was previously unmonitored', async () => {
      await runIndicators();

      expect(mockQueueHealth.isHealthy).toHaveBeenCalled();
    });

    it('reports the read replica alongside the primary', async () => {
      mockPrisma.checkReplica.mockResolvedValue({
        enabled: true,
        inUse: true,
        healthy: true,
        consecutiveFailures: 0,
        lastCheckedAt: null,
        lastError: null,
        cooldownRemainingMs: 0,
      });

      await runIndicators();

      expect(mockPrisma.checkReplica).toHaveBeenCalled();
    });

    it('annotates every dependency with latency and a last-check timestamp', async () => {
      const results = await runIndicators();

      expect(results).toHaveLength(6);
      for (const result of results) {
        const entries = Object.entries(result);
        expect(entries).toHaveLength(1);

        const [key, value] = entries[0] as [string, any];
        expect(key).toBeTruthy();
        expect(typeof value.latencyMs).toBe('number');
        expect(value).toMatchObject({
          lastCheckedAt: expect.any(String),
          consecutiveFailures: 0,
          failureThreshold: 3,
        });
      }
    });

    it('annotates the pool indicator, which is not a terminus indicator', async () => {
      const results = await runIndicators();

      expect(results[POOL].database_pool).toMatchObject({
        status: 'up',
        degraded: false,
        poolSize: 10,
        latencyMs: expect.any(Number),
      });
    });

    it('records a success in the registry', async () => {
      await runIndicators();

      expect(probes.get('redis')).toMatchObject({ consecutiveFailures: 0 });
    });

    it('reports a failing dependency as up + degraded below the threshold', async () => {
      mockQueueHealth.isHealthy.mockRejectedValue(new Error('redis blip'));

      const results = await runIndicators();

      // Terminus only understands 'up' | 'down'; a tolerated failure must be
      // 'up' so the endpoint stays 200, with `degraded` carrying the truth.
      expect(results[QUEUE].queue).toMatchObject({
        status: 'up',
        degraded: true,
        consecutiveFailures: 1,
        error: 'redis blip',
        tolerated: true,
      });
    });

    it('throws HealthCheckError once the failure threshold is reached', async () => {
      mockQueueHealth.isHealthy.mockRejectedValue(new Error('redis gone'));

      const first = await settledProbe(controller, QUEUE);
      expect(first.ok).toBe(true);
      expect(first.value.queue).toMatchObject({
        status: 'up',
        degraded: true,
        tolerated: true,
        consecutiveFailures: 1,
      });

      const second = await settledProbe(controller, QUEUE);
      expect(second.ok).toBe(true);
      expect(second.value.queue).toMatchObject({
        status: 'up',
        degraded: true,
        tolerated: true,
        consecutiveFailures: 2,
      });

      // The third consecutive failure is what terminus turns into a 503.
      const third = await settledProbe(controller, QUEUE);
      expect(third.ok).toBe(false);
      expect(third.error).toBeInstanceOf(HealthCheckError);
      expect(third.error.causes.queue).toMatchObject({
        status: 'down',
        error: 'redis gone',
        consecutiveFailures: 3,
      });
    });

    it('honours HEALTH_FAILURE_THRESHOLD=1', async () => {
      const module = await buildModule({ HEALTH_FAILURE_THRESHOLD: '1' });
      const strictController = module.get<HealthController>(HealthController);

      mockQueueHealth.isHealthy.mockRejectedValue(new Error('redis gone'));

      const outcome = await settledProbe(strictController, QUEUE);

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBeInstanceOf(HealthCheckError);
      expect(probes.get('queue')).toMatchObject({
        failureThreshold: 1,
        consecutiveFailures: 1,
        tolerated: false,
      });
    });

    it('never escalates a read-replica failure to down', async () => {
      mockPrisma.checkReplica.mockResolvedValue({
        enabled: true,
        inUse: false,
        healthy: false,
        consecutiveFailures: 5,
        lastCheckedAt: null,
        lastError: 'replica unreachable',
        cooldownRemainingMs: 30000,
      });

      const results = await runIndicators();

      // Reads fail open to the primary, so a dead replica is not a 503.
      expect(results[REPLICA].database_replica).toMatchObject({
        status: 'up',
        degraded: true,
        healthy: false,
        inUse: false,
      });
    });

    it('reports an unconfigured replica as healthy and not degraded', async () => {
      const results = await runIndicators();

      expect(results[REPLICA].database_replica).toMatchObject({
        status: 'up',
        enabled: false,
        degraded: false,
      });
    });

    it('times a hung dependency out instead of holding the request open', async () => {
      const module = await buildModule({ HEALTH_CHECK_TIMEOUT_MS: '20' });
      const impatientController =
        module.get<HealthController>(HealthController);

      // Simulate a socket that never answers.
      mockHttp.pingCheck.mockReturnValue(new Promise(() => undefined));

      const results = await runIndicators(impatientController);

      expect(results[HORIZON].stellar_horizon).toMatchObject({
        status: 'up',
        degraded: true,
        error: expect.stringContaining('stellar_horizon'),
      });
      // The other probes are unaffected by the hung one.
      expect(results[DATABASE].database).toBeDefined();
      expect(results[REDIS].redis).toBeDefined();
    });

    it('throws 503 while shutting down', async () => {
      shutdownState.markShuttingDown();

      await expect(controller.check()).rejects.toThrow(
        'Server is shutting down',
      );
      expect(mockHealth.check).not.toHaveBeenCalled();
    });
  });
});
