import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackEventDto } from './dto/track-event.dto';
import { AnalyticsEventResponseDto } from './dto/analytics-event-response.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a single analytics event.
   *
   * The sequenceNumber is carried through unchanged and stored in the DB so
   * that bulk-flushes can be ordered correctly even if job delivery is
   * out-of-order.
   */
  async trackEvent(dto: TrackEventDto): Promise<AnalyticsEventResponseDto> {
    const event = await this.prisma.analyticsEvent.create({
      data: {
        userId: dto.userId,
        eventName: dto.eventName,
        payload: dto.payload ?? undefined,
        sequenceNumber: dto.sequenceNumber,
      },
    });
    return this.toDto(event);
  }

  /**
   * Return all analytics events for a given user, sorted ascending by
   * sequenceNumber.
   *
   * This is the query the processor calls before flushing a batch to the
   * warehouse, guaranteeing that earlier events are always written first
   * regardless of the order BullMQ delivered the jobs.
   */
  async getOrderedEventsForUser(
    userId: string,
  ): Promise<AnalyticsEventResponseDto[]> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: { userId },
      orderBy: { sequenceNumber: 'asc' },
    });
    return events.map((e) => this.toDto(e));
  }

  private toDto(event: {
    id: string;
    userId: string;
    eventName: string;
    payload: unknown;
    sequenceNumber: number;
    createdAt: Date;
  }): AnalyticsEventResponseDto {
    return {
      id: event.id,
      userId: event.userId,
      eventName: event.eventName,
      payload: event.payload as Record<string, unknown> | null,
      sequenceNumber: event.sequenceNumber,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
