import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PrismaService,
  clampPoolSize,
  parsePositiveInt,
  withPoolParams,
} from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const key of [
      'DATABASE_URL',
      'PRISMA_POOL_SIZE',
      'PRISMA_POOL_TIMEOUT_MS',
      'PRISMA_QUEUE_TIMEOUT_MS',
    ]) {
      prevEnv[key] = process.env[key];
    }
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/stellaraid?schema=public';
    process.env.PRISMA_POOL_SIZE = '8';
    process.env.PRISMA_POOL_TIMEOUT_MS = '5000';
    process.env.PRISMA_QUEUE_TIMEOUT_MS = '200';

    const module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    service = module.get<PrismaService>(PrismaService);
    // Avoid real DB connect in unit tests
    jest.spyOn(service, '$connect').mockResolvedValue(undefined as never);
    jest.spyOn(service, '$disconnect').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have onModuleInit method', () => {
    expect(typeof service.onModuleInit).toBe('function');
  });

  it('should have enableShutdownHooks method', () => {
    expect(typeof service.enableShutdownHooks).toBe('function');
  });

  it('clamps pool size between 5 and 20', () => {
    expect(clampPoolSize(undefined)).toBe(10);
    expect(clampPoolSize('2')).toBe(5);
    expect(clampPoolSize('50')).toBe(20);
    expect(clampPoolSize('12')).toBe(12);
  });

  it('parses positive ints with fallback', () => {
    expect(parsePositiveInt(undefined, 9)).toBe(9);
    expect(parsePositiveInt('0', 9)).toBe(9);
    expect(parsePositiveInt('1500', 9)).toBe(1500);
  });

  it('injects connection_limit and pool_timeout into DATABASE_URL', () => {
    const url = withPoolParams(
      'postgresql://u:p@localhost:5432/db?schema=public',
      10,
      10_000,
    );
    expect(url).toContain('connection_limit=10');
    expect(url).toContain('pool_timeout=10');
  });

  it('reports pool status from configured env', () => {
    const status = service.getPoolStatus();
    expect(status.poolSize).toBe(8);
    expect(status.poolTimeoutMs).toBe(5000);
    expect(status.queueTimeoutMs).toBe(200);
    expect(status.active).toBe(0);
    expect(status.exhausted).toBe(false);
  });

  it('queues with timeout instead of hanging when pool is exhausted', async () => {
    const started = Date.now();
    const holders = Array.from({ length: service.poolSize }, () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const run = service.withPoolSlot(() => gate);
      return { release: release!, run };
    });

    await expect(
      service.withPoolSlot(async () => 'should-timeout'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(Date.now() - started).toBeLessThan(2000);

    for (const h of holders) h.release();
    await Promise.all(holders.map((h) => h.run));
  });

  it('load test: 50 concurrent requests complete without indefinite hang', async () => {
    process.env.PRISMA_QUEUE_TIMEOUT_MS = '5000';
    const module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    const pooled = module.get<PrismaService>(PrismaService);
    jest.spyOn(pooled, '$connect').mockResolvedValue(undefined as never);
    jest.spyOn(pooled, '$disconnect').mockResolvedValue(undefined as never);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        pooled.withPoolSlot(async () => {
          await new Promise((r) => setTimeout(r, 5));
          return i;
        }),
      ),
    );

    expect(results).toHaveLength(50);
    expect(pooled.getPoolStatus().active).toBe(0);
    expect(pooled.getPoolStatus().queued).toBe(0);
  });
});
