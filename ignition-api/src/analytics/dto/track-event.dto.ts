import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackEventDto {
  @ApiProperty({
    description: 'ID of the user who generated the event',
    example: 'user-uuid-1',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Human-readable event name',
    example: 'sent_payment',
  })
  @IsString()
  @IsNotEmpty()
  eventName: string;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON metadata for the event',
    example: { amount: '50.00', assetCode: 'USDC' },
  })
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiProperty({
    description:
      'Monotonically increasing per-user sequence number. ' +
      'Must be strictly greater than the previous event for this user. ' +
      'The processor sorts by this value before flushing to guarantee causal ordering.',
    example: 42,
  })
  @IsInt()
  @Min(0)
  sequenceNumber: number;
}
