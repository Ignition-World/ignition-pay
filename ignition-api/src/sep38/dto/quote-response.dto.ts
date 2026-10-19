import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class QuoteResponseDto {
  @ApiProperty({ description: 'Unique quote ID' })
  id: string

  @ApiProperty({ description: 'Price of one unit of sell asset in buy asset' })
  price: string

  @ApiProperty({ description: 'Total price in buy asset' })
  totalPrice: string

  @ApiProperty({ description: 'Amount of sell asset' })
  sellAmount: string

  @ApiProperty({ description: 'Amount of buy asset to be received' })
  buyAmount: string

  @ApiProperty({ description: 'Sell asset code' })
  sellAsset: string

  @ApiProperty({ description: 'Buy asset code' })
  buyAsset: string

  @ApiPropertyOptional({ description: 'Fee details' })
  fee?: { total: string; asset: string }

  @ApiProperty({ description: 'Quote expiration timestamp' })
  expiresAt: string

  @ApiProperty({ description: 'Quote creation timestamp' })
  createdAt: string
}
