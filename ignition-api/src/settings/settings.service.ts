import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export interface SystemSettingsDto {
  sessionAccessTtlSeconds: number;
  sessionTtlSeconds: number;
  sessionIdleTimeoutSeconds: number;
  sessionPersistenceEnabled: boolean;
  addressGenerationThrottleLimit: number;
  addressGenerationThrottleTtlSeconds: number;
  addressGenerationThrottleAlertThresholdPercent: number;
  addressGenerationThrottleSustainedBreachMinutes: number;
  addressGenerationThrottleUniqueIpsThreshold: number;
  addressGenerationThrottleAlertCooldownMinutes: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cachedSettings: SystemSettingsDto | null = null;
  private cacheTtl = 60000; // Cache for 1 minute
  private lastCacheUpdate = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Initialize settings if none exist
    this.initializeSettings();
  }

  private async initializeSettings(): Promise<void> {
    const settingsCount = await this.prisma.systemSettings.count();
    if (settingsCount === 0) {
      // Create default settings
      await this.prisma.systemSettings.create({
        data: {
          sessionAccessTtlSeconds: this.configService.get<number>('SESSION_ACCESS_TTL_SECONDS', 900),
          sessionTtlSeconds: this.configService.get<number>('SESSION_TTL_SECONDS', 604800),
          sessionIdleTimeoutSeconds: this.configService.get<number>('SESSION_IDLE_TIMEOUT_SECONDS', 1800),
          sessionPersistenceEnabled: true,
          addressGenerationThrottleLimit: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_LIMIT', 5),
          addressGenerationThrottleTtlSeconds: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_TTL_SECONDS', 60),
          addressGenerationThrottleAlertThresholdPercent: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_ALERT_THRESHOLD_PERCENT', 80),
          addressGenerationThrottleSustainedBreachMinutes: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_SUSTAINED_BREACH_MINUTES', 5),
          addressGenerationThrottleUniqueIpsThreshold: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_UNIQUE_IPS_THRESHOLD', 50),
          addressGenerationThrottleAlertCooldownMinutes: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_ALERT_COOLDOWN_MINUTES', 10),
        },
      });
      this.logger.log('Default system settings created');
    }
  }

  /**
   * Get current system settings, using cache to avoid frequent DB queries
   */
  async getSettings(): Promise<SystemSettingsDto> {
    const now = Date.now();
    
    // Return cached settings if still valid
    if (this.cachedSettings && now - this.lastCacheUpdate < this.cacheTtl) {
      return this.cachedSettings;
    }

    // Fetch from database
    const settings = await this.prisma.systemSettings.findFirst({
      select: {
        sessionAccessTtlSeconds: true,
        sessionTtlSeconds: true,
        sessionIdleTimeoutSeconds: true,
        sessionPersistenceEnabled: true,
        addressGenerationThrottleLimit: true,
        addressGenerationThrottleTtlSeconds: true,
        addressGenerationThrottleAlertThresholdPercent: true,
        addressGenerationThrottleSustainedBreachMinutes: true,
        addressGenerationThrottleUniqueIpsThreshold: true,
        addressGenerationThrottleAlertCooldownMinutes: true,
      },
    });

    if (!settings) {
      // Fallback to defaults if no settings found
      const defaults: SystemSettingsDto = {
        sessionAccessTtlSeconds: this.configService.get<number>('SESSION_ACCESS_TTL_SECONDS', 900),
        sessionTtlSeconds: this.configService.get<number>('SESSION_TTL_SECONDS', 604800),
        sessionIdleTimeoutSeconds: this.configService.get<number>('SESSION_IDLE_TIMEOUT_SECONDS', 1800),
        sessionPersistenceEnabled: true,
        addressGenerationThrottleLimit: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_LIMIT', 5),
        addressGenerationThrottleTtlSeconds: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_TTL_SECONDS', 60),
        addressGenerationThrottleAlertThresholdPercent: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_ALERT_THRESHOLD_PERCENT', 80),
        addressGenerationThrottleSustainedBreachMinutes: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_SUSTAINED_BREACH_MINUTES', 5),
        addressGenerationThrottleUniqueIpsThreshold: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_UNIQUE_IPS_THRESHOLD', 50),
        addressGenerationThrottleAlertCooldownMinutes: this.configService.get<number>('ADDRESS_GENERATION_THROTTLE_ALERT_COOLDOWN_MINUTES', 10),
      };
      this.cachedSettings = defaults;
      this.lastCacheUpdate = now;
      return defaults;
    }

    this.cachedSettings = settings;
    this.lastCacheUpdate = now;
    return settings;
  }

  /**
   * Update system settings (admin only)
   */
  async updateSettings(updates: Partial<SystemSettingsDto>): Promise<SystemSettingsDto> {
    const currentSettings = await this.prisma.systemSettings.findFirst();
    
    if (!currentSettings) {
      throw new Error('No system settings found to update');
    }

    const updated = await this.prisma.systemSettings.update({
      where: { id: currentSettings.id },
      data: {
        ...(updates.sessionAccessTtlSeconds !== undefined && { sessionAccessTtlSeconds: updates.sessionAccessTtlSeconds }),
        ...(updates.sessionTtlSeconds !== undefined && { sessionTtlSeconds: updates.sessionTtlSeconds }),
        ...(updates.sessionIdleTimeoutSeconds !== undefined && { sessionIdleTimeoutSeconds: updates.sessionIdleTimeoutSeconds }),
        ...(updates.sessionPersistenceEnabled !== undefined && { sessionPersistenceEnabled: updates.sessionPersistenceEnabled }),
        ...(updates.addressGenerationThrottleLimit !== undefined && { addressGenerationThrottleLimit: updates.addressGenerationThrottleLimit }),
        ...(updates.addressGenerationThrottleTtlSeconds !== undefined && { addressGenerationThrottleTtlSeconds: updates.addressGenerationThrottleTtlSeconds }),
        ...(updates.addressGenerationThrottleAlertThresholdPercent !== undefined && { addressGenerationThrottleAlertThresholdPercent: updates.addressGenerationThrottleAlertThresholdPercent }),
        ...(updates.addressGenerationThrottleSustainedBreachMinutes !== undefined && { addressGenerationThrottleSustainedBreachMinutes: updates.addressGenerationThrottleSustainedBreachMinutes }),
        ...(updates.addressGenerationThrottleUniqueIpsThreshold !== undefined && { addressGenerationThrottleUniqueIpsThreshold: updates.addressGenerationThrottleUniqueIpsThreshold }),
        ...(updates.addressGenerationThrottleAlertCooldownMinutes !== undefined && { addressGenerationThrottleAlertCooldownMinutes: updates.addressGenerationThrottleAlertCooldownMinutes }),
        updatedAt: new Date(),
      },
      select: {
        sessionAccessTtlSeconds: true,
        sessionTtlSeconds: true,
        sessionIdleTimeoutSeconds: true,
        sessionPersistenceEnabled: true,
        addressGenerationThrottleLimit: true,
        addressGenerationThrottleTtlSeconds: true,
        addressGenerationThrottleAlertThresholdPercent: true,
        addressGenerationThrottleSustainedBreachMinutes: true,
        addressGenerationThrottleUniqueIpsThreshold: true,
        addressGenerationThrottleAlertCooldownMinutes: true,
      },
    });

    // Update cache
    this.cachedSettings = updated;
    this.lastCacheUpdate = Date.now();
    
    this.logger.log('System settings updated successfully');
    return updated;
  }

  /**
   * Invalidate cache to force fresh database read
   */
  invalidateCache(): void {
    this.cachedSettings = null;
    this.lastCacheUpdate = 0;
  }
}