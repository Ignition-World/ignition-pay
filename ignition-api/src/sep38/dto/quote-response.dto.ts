import { ApiProperty } from '@nestjs/swagger';

export class QuoteResponseDto {
  @ApiProperty({ description: 'Unique quote ID (UUID)' })
  id: string;

  @ApiProperty({ description: 'Stellar account of the requesting user' })
  userId: string;

  @ApiProperty({ description: 'Asset being sold' })
  sellAsset: string;

  @ApiProperty({ description: 'Asset being bought' })
  buyAsset: string;

  @ApiProperty({
    description: 'Sell amount as a string to preserve full decimal precision',
  })
  sellAmount: string;

  @ApiProperty({
    description:
      'Quoted price per unit — returned as a string to preserve sub-cent precision (e.g. 0.00000000123)',
  })
  price: string;

  @ApiProperty({ description: 'ISO-8601 expiry timestamp for this quote' })
  expiresAt: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: string;
}
