import { ConfigService } from '@nestjs/config';
import { ApiKeyExpirationService } from './api-key-expiration.service';

describe('ApiKeyExpirationService', () => {
  let service: ApiKeyExpirationService;
  let prisma: { apiKey: { updateMany: jest.Mock; update: jest.Mock } };
  let config: { get: jest.Mock };

  let emailQueue: { add: jest.Mock };


  
  beforeEach(() => {
    prisma = {
      apiKey: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    config = {
      get: jest.fn().mockReturnValue('3600000'),
    };

    emailQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    service = new ApiKeyExpirationService(
      prisma as never,
      config as unknown as ConfigService,
      emailQueue as never,
    );
  });

  it('deactivates stale keys based on the configured TTL', async () => {
    await service.deactivateExpiredKeys();

    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
        }),
      }),
    );
  });

  it('touches usage for a key when it is validated', async () => {
    await service.touchUsage('key-1');

    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-1' },
      }),
    );
  });
});
