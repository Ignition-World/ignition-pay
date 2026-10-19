import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsEventResponseDto {
  @ApiProperty({ description: 'Unique event ID (UUID)' })
  id: string;

  @ApiProperty({ description: 'User ID that generated the event' })
  userId: string;

  @ApiProperty({ description: 'Event name' })
  eventName: string;

  @ApiPropertyOptional({ description: 'JSON payload' })
  payload?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Per-user sequence number — events are ordered by this value',
  })
  sequenceNumber: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;
}
