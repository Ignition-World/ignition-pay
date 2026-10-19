import { AddressGenerationThrottleMonitorService } from './address-generation-throttle-monitor.service';

describe('AddressGenerationThrottleMonitorService', () => {
  const defaultSettings = {
    sessionAccessTtlSeconds: 900,
    sessionTtlSeconds: 604800,
    sessionIdleTimeoutSeconds: 1800,
    sessionPersistenceEnabled: true,
    addressGenerationThrottleLimit: 5,
    addressGenerationThrottleTtlSeconds: 60,
    addressGenerationThrottleAlertThresholdPercent: 80,
    addressGenerationThrottleSustainedBreachMinutes: 5,
    addressGenerationThrottleUniqueIpsThreshold: 50,
    addressGenerationThrottleAlertCooldownMinutes: 10,
  };

  it('sends an alert when the 80% threshold is reached', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue(defaultSettings),
    };
    const notificationsService = {
      sendAlert: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AddressGenerationThrottleMonitorService(
      settingsService as any,
      notificationsService as any,
    );

    await service.recordEvent({
      ip: '203.0.113.9',
      endpoint: '/addresses/generate',
      count: 4,
      limit: 5,
      isBlocked: false,
    });

    expect(notificationsService.sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('throttle'),
      }),
    );
  });

  it('deduplicates alerts for the same IP within the cooldown window', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue(defaultSettings),
    };
    const notificationsService = {
      sendAlert: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AddressGenerationThrottleMonitorService(
      settingsService as any,
      notificationsService as any,
    );

    await service.recordEvent({
      ip: '198.51.100.2',
      endpoint: '/addresses/generate',
      count: 5,
      limit: 5,
      isBlocked: true,
    });
    await service.recordEvent({
      ip: '198.51.100.2',
      endpoint: '/addresses/generate',
      count: 5,
      limit: 5,
      isBlocked: true,
    });

    expect(notificationsService.sendAlert).toHaveBeenCalledTimes(1);
  });
});
