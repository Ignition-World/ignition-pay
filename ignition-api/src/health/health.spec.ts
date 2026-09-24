import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HttpHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { PrismaService } from '../prisma/prisma.service';

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

  beforeEach(async () => {
    mockHealth = { check: jest.fn() };
    mockHttp = { pingCheck: jest.fn() };
    mockPrismaHealth = { pingCheck: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        RedisHealthIndicator,
        { provide: HealthCheckService, useValue: mockHealth },
        { provide: HttpHealthIndicator, useValue: mockHttp },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealth },
        { provide: PrismaService, useValue: {
          getPoolStatus: () => ({
            poolSize: 10,
            poolTimeoutMs: 10000,
            queueTimeoutMs: 10000,
            active: 0,
            queued: 0,
            available: 10,
            exhausted: false,
          }),
        } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key, def) => {
              if (key === 'REDIS_URL') return 'redis://localhost:6379';
              if (key === 'STELLAR_HORIZON_URL')
                return 'https://horizon.testnet.org';
              return def;
            }),
          },
        },
      ],
    }).compile();

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
  });
});
