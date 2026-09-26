import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService, SystemSettingsDto } from '../settings/settings.service';

export interface AddressGenerationThrottleEvent {
  ip: string;
  endpoint: string;
  count: number;
  limit: number;
  isBlocked: boolean;
  occurredAt?: Date;
}

export interface AddressGenerationThrottleStats {
  totalEvents: number;
  blockedEvents: number;
  uniqueIpsLastMinute: number;
  currentLimit: number;
  currentTtlSeconds: number;
  alertThresholdPercent: number;
  sustainedBreachMinutes: number;
  uniqueIpsThreshold: number;
  alertCooldownMinutes: number;
  eventsByIp: Record<string, number>;
  eventsByEndpoint: Record<string, number>;
}

@Injectable()
export class AddressGenerationThrottleMonitorService {
  private readonly logger = new Logger(AddressGenerationThrottleMonitorService.name);
  private readonly lastAlertByIp = new Map<string, number>();
  private readonly blockedEventTimesByIp = new Map<string, number[]>();
  private readonly uniqueIpsByMinute = new Map<number, Set<string>>();
  private readonly eventCountByIp = new Map<string, number>();
  private readonly eventCountByEndpoint = new Map<string, number>();
  private readonly globalAlertCooldowns = new Map<string, number>();
  private totalEvents = 0;
  private blockedEvents = 0;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async recordEvent(event: AddressGenerationThrottleEvent): Promise<void> {
    const occurredAt = event.occurredAt ?? new Date();
    const now = occurredAt.getTime();
    const ip = event.ip || 'unknown';
    const endpoint = event.endpoint || 'unknown';
    const count = Number(event.count ?? 0);
    const limit = Number(event.limit ?? 5);

    this.totalEvents += 1;
    if (event.isBlocked) {
      this.blockedEvents += 1;
      const minuteBucket = Math.floor(now / 60_000);
      const ips = this.uniqueIpsByMinute.get(minuteBucket) ?? new Set<string>();
      ips.add(ip);
      this.uniqueIpsByMinute.set(minuteBucket, ips);

      const times = this.blockedEventTimesByIp.get(ip) ?? [];
      times.push(now);
      this.blockedEventTimesByIp.set(ip, times.filter((ts) => ts >= now - 5 * 60_000));
    }

    this.eventCountByIp.set(ip, (this.eventCountByIp.get(ip) ?? 0) + 1);
    this.eventCountByEndpoint.set(
      endpoint,
      (this.eventCountByEndpoint.get(endpoint) ?? 0) + 1,
    );

    const settings = await this.settingsService.getSettings();
    const alertPercent = Number(
      settings.addressGenerationThrottleAlertThresholdPercent ?? 80,
    );
    const threshold = Math.max(1, Math.ceil((limit * alertPercent) / 100));

    this.logger.warn(
      `Address generation throttle event logged: ip=${ip} endpoint=${endpoint} count=${count} limit=${limit} threshold=${threshold} blocked=${event.isBlocked}`,
    );

    await this.maybeEmitIpAlert(ip, event, now, settings, threshold);
    await this.maybeEmitSustainedBreachAlert(ip, now, settings);
    await this.maybeEmitUniqueIpAlert(now, settings);
  }

  async getCurrentStats(): Promise<AddressGenerationThrottleStats> {
    const settings = await this.settingsService.getSettings();
    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const uniqueIpsLastMinute = this.getUniqueIpCountInLastMinute(now);

    for (const [bucket] of this.uniqueIpsByMinute.entries()) {
      if (bucket < minuteBucket - 1) {
        this.uniqueIpsByMinute.delete(bucket);
      }
    }

    return {
      totalEvents: this.totalEvents,
      blockedEvents: this.blockedEvents,
      uniqueIpsLastMinute,
      currentLimit: settings.addressGenerationThrottleLimit ?? 5,
      currentTtlSeconds: settings.addressGenerationThrottleTtlSeconds ?? 60,
      alertThresholdPercent:
        settings.addressGenerationThrottleAlertThresholdPercent ?? 80,
      sustainedBreachMinutes:
        settings.addressGenerationThrottleSustainedBreachMinutes ?? 5,
      uniqueIpsThreshold:
        settings.addressGenerationThrottleUniqueIpsThreshold ?? 50,
      alertCooldownMinutes:
        settings.addressGenerationThrottleAlertCooldownMinutes ?? 10,
      eventsByIp: Object.fromEntries(
        [...this.eventCountByIp.entries()].sort((a, b) => b[1] - a[1]),
      ),
      eventsByEndpoint: Object.fromEntries(
        [...this.eventCountByEndpoint.entries()].sort((a, b) => b[1] - a[1]),
      ),
    };
  }

  private async maybeEmitIpAlert(
    ip: string,
    event: AddressGenerationThrottleEvent,
    now: number,
    settings: SystemSettingsDto,
    threshold: number,
  ): Promise<void> {
    const shouldAlert =
      event.count >= threshold ||
      (event.isBlocked && event.count >= settings.addressGenerationThrottleLimit);

    if (!shouldAlert) {
      return;
    }

    const cooldownMs =
      (settings.addressGenerationThrottleAlertCooldownMinutes ?? 10) * 60_000;
    const lastAlert = this.lastAlertByIp.get(ip) ?? 0;
    if (now - lastAlert < cooldownMs) {
      return;
    }

    this.lastAlertByIp.set(ip, now);
    await this.notificationsService.sendAlert({
      title: 'Address generation throttle alert',
      message: `IP ${ip} reached ${event.count}/${event.limit} requests on ${event.endpoint}. Threshold alert is ${threshold}.`,
      level: event.isBlocked ? 'critical' : 'warning',
      metadata: {
        ip,
        endpoint: event.endpoint,
        count: event.count,
        limit: event.limit,
        threshold,
      },
    });
  }

  private async maybeEmitSustainedBreachAlert(
    ip: string,
    now: number,
    settings: SystemSettingsDto,
  ): Promise<void> {
    const breachMinutes = settings.addressGenerationThrottleSustainedBreachMinutes ?? 5;
    const breachWindowMs = breachMinutes * 60_000;
    const times = this.blockedEventTimesByIp.get(ip) ?? [];
    const trimmed = times.filter((ts) => ts >= now - breachWindowMs);
    this.blockedEventTimesByIp.set(ip, trimmed);

    if (trimmed.length < 2) {
      return;
    }

    const earliest = trimmed[0];
    const latest = trimmed[trimmed.length - 1];
    const sustainedWindow = latest - earliest;
    if (sustainedWindow < breachWindowMs) {
      return;
    }

    const cooldownMs =
      (settings.addressGenerationThrottleAlertCooldownMinutes ?? 10) * 60_000;
    const lastAlert = this.lastAlertByIp.get(ip) ?? 0;
    if (now - lastAlert < cooldownMs) {
      return;
    }

    this.lastAlertByIp.set(ip, now);
    await this.notificationsService.sendAlert({
      title: 'Sustained address generation throttling',
      message: `IP ${ip} breached the address-generation limit continuously for ${breachMinutes} minutes.`,
      level: 'critical',
      metadata: {
        ip,
        sustainedMinutes: breachMinutes,
        earliest,
        latest,
      },
    });
  }

  private async maybeEmitUniqueIpAlert(
    now: number,
    settings: SystemSettingsDto,
  ): Promise<void> {
    const uniqueIpThreshold = settings.addressGenerationThrottleUniqueIpsThreshold ?? 50;
    const uniqueIpCount = this.getUniqueIpCountInLastMinute(now);

    if (uniqueIpCount <= uniqueIpThreshold) {
      return;
    }

    const cooldownMs =
      (settings.addressGenerationThrottleAlertCooldownMinutes ?? 10) * 60_000;
    const key = 'global:unique_ips';
    const lastAlert = this.globalAlertCooldowns.get(key) ?? 0;
    if (now - lastAlert < cooldownMs) {
      return;
    }

    this.globalAlertCooldowns.set(key, now);
    await this.notificationsService.sendAlert({
      title: 'High address generation throttle volume',
      message: `More than ${uniqueIpThreshold} unique IPs triggered address-generation throttling within a single minute (${uniqueIpCount} observed).`,
      level: 'warning',
      metadata: {
        uniqueIpCount,
        threshold: uniqueIpThreshold,
      },
    });
  }

  private getUniqueIpCountInLastMinute(now: number): number {
    const minuteBucket = Math.floor(now / 60_000);
    const recentBuckets = new Set<string>();

    for (const [bucket, ips] of this.uniqueIpsByMinute.entries()) {
      if (bucket >= minuteBucket - 1) {
        for (const ip of ips) {
          recentBuckets.add(ip);
        }
      }
    }

    return recentBuckets.size;
  }
}
