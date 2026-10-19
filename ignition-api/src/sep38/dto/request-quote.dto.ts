import { IsString, IsNumber, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RequestQuoteDto {
  @ApiProperty({ description: 'Anchor name (e.g. "StellarX", "AnchorUSD")' })
  @IsString()
  anchorName: string

  @ApiProperty({ description: 'Asset to sell (e.g. "USD", "EUR")' })
  @IsString()
  sellAsset: string

  @ApiProperty({ description: 'Asset to buy (e.g. "USDC", "XLM")' })
  @IsString()
  buyAsset: string

  @ApiProperty({ description: 'Amount of sell asset' })
  @IsNumber()
  @Min(0)
  sellAmount: number
}
