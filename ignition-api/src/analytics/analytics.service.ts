import { Injectable, Logger, Optional } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../prisma/prisma.service';

export interface AnalyticsEvent {
  name: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsExportOptions {
  userId?: string;
  batchSize?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface ChunkedResponseStream {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean | void;
  end(): void;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

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

  /**
   * Stream analytics events using HTTP chunked transfer encoding (Issue #805).
   * Fetches events in bounded batches using cursor pagination and streams
   * JSON chunks directly to the response socket, preventing OOM crashes for accounts
   * with >100k events.
   */
  async streamExport(
    res: ChunkedResponseStream,
    options: AnalyticsExportOptions = {},
  ): Promise<void> {
    const { userId, batchSize = 1000, startDate, endDate } = options;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="analytics-export.json"',
    );

    res.write('[\n');

    let cursor: string | undefined;
    let isFirst = true;

    if (!this.prisma) {
      res.write('\n]');
      res.end();
      return;
    }

    const where: any = {
      resourceType: 'Analytics',
    };
    if (userId) {
      where.userId = userId;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    while (true) {
      const records = await this.prisma.auditLog.findMany({
        take: batchSize,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        where,
        orderBy: { id: 'asc' },
      });

      if (!records || records.length === 0) break;

      for (const record of records) {
        if (!isFirst) {
          res.write(',\n');
        }
        res.write(JSON.stringify(record));
        isFirst = false;
      }

      cursor = records[records.length - 1].id;
      if (records.length < batchSize) break;
    }

    res.write('\n]');
    res.end();
  }
}
