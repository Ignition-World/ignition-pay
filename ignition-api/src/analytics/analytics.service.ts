import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

export interface AnalyticsEvent {
  name: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  track(event: AnalyticsEvent): void {
    const { name, userId, properties } = event;

    this.logger.log(JSON.stringify({ event: name, userId, ...properties }));

    Sentry.addBreadcrumb({
      category: 'analytics',
      message: name,
      data: { userId, ...properties },
      level: 'info',
    });
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    Sentry.setUser({ id: userId, ...traits });
    this.logger.log(JSON.stringify({ identify: userId, ...traits }));
  }
}
