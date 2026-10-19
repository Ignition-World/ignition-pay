import { IsString, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateQuoteDto {
  @ApiProperty({
    description: 'Asset being sold (e.g. "USDC:GBBD...")',
    example: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @IsString()
  @IsNotEmpty()
  sellAsset: string;

  @ApiProperty({
    description: 'Asset being bought (e.g. "iso4217:USD")',
    example: 'iso4217:USD',
  })
  @IsString()
  @IsNotEmpty()
  buyAsset: string;

  @ApiProperty({
    description: 'Amount of sellAsset to sell',
    example: '100.0000000',
  })
  @IsString()
  @IsNotEmpty()
  sellAmount: string;

  @ApiProperty({
    description: 'Quoted price per unit of sellAsset in buyAsset terms',
    example: '0.00000000123',
  })
  @IsString()
  @IsNotEmpty()
  price: string;

  @ApiProperty({
    description: 'ISO-8601 expiry timestamp for this quote',
    example: '2026-10-20T10:00:00.000Z',
  })
  @IsDateString()
  expiresAt: string;
}
