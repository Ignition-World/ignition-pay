import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ValidateNested, IsInt, IsOptional, Min, Max } from 'class-validator'

export class InitiateSep24ResponseDto {
  @ApiProperty({ description: 'Our internal SEP-24 transaction ID' })
  id: string

  @ApiProperty({ description: 'The anchor transaction ID' })
  anchorTxId: string

  @ApiProperty({ description: 'Interactive URL to load in iframe/popup' })
  interactiveUrl: string

  @ApiProperty({ description: 'Current status of the transaction' })
  status: string

  @ApiPropertyOptional({ description: 'Human-readable status description' })
  statusDesc?: string

  @ApiPropertyOptional({ description: 'More info URL for additional details' })
  moreInfoUrl?: string

  @ApiProperty({ description: 'When the transaction was initiated' })
  startedAt: Date
}

export class Sep24TransactionStatusResponseDto {
  @ApiProperty({ description: 'Our internal SEP-24 transaction ID' })
  id: string

  @ApiProperty({ description: 'The anchor transaction ID' })
  anchorTxId: string

  @ApiProperty({ description: 'Current status from SEP-24 spec' })
  status: string

  @ApiPropertyOptional({ description: 'Human-readable status description' })
  statusDesc?: string

  @ApiPropertyOptional({ description: 'More info URL for additional details' })
  moreInfoUrl?: string

  @ApiPropertyOptional({ description: 'Stellar transaction hash when completed' })
  stellarTxHash?: string

  @ApiPropertyOptional({ description: 'External transaction ID' })
  externalTxId?: string

  @ApiPropertyOptional({ description: 'Optional message from the anchor' })
  message?: string

  @ApiProperty({ description: 'Amount transferred' })
  amountIn?: string

  @ApiProperty({ description: 'Amount received in stellar asset' })
  amountOut?: string

  @ApiPropertyOptional({ description: 'Fee charged by the anchor' })
  feeDetails?: Record<string, unknown>

  @ApiProperty({ description: 'When the transaction was initiated' })
  startedAt: Date

  @ApiPropertyOptional({ description: 'When the transaction was completed' })
  completedAt?: Date
}

export class Sep24HistoryItemDto {
  @ApiProperty({ description: 'Internal transaction ID' })
  id: string

  @ApiProperty({ description: 'Anchor name', example: 'StellarX' })
  anchorName: string

  @ApiProperty({ enum: ['deposit', 'withdraw'], description: 'Type of operation' })
  operation: 'deposit' | 'withdraw'

  @ApiProperty({ description: 'Asset code', example: 'USD' })
  assetCode: string

  @ApiPropertyOptional({ description: 'Asset issuer address' })
  assetIssuer?: string

  @ApiPropertyOptional({ description: 'Amount transacted', example: '100.00' })
  amount?: string

  @ApiProperty({ description: 'Current SEP-24 status', example: 'completed' })
  status: string

  @ApiPropertyOptional({ description: 'Human-readable status description' })
  statusDesc?: string

  @ApiPropertyOptional({ description: 'Anchor transaction ID' })
  anchorTxId?: string

  @ApiPropertyOptional({ description: 'Stellar transaction hash' })
  stellarTxHash?: string

  @ApiPropertyOptional({ description: 'More info URL' })
  moreInfoUrl?: string

  @ApiProperty({ description: 'When the transaction was initiated' })
  startedAt: Date

  @ApiPropertyOptional({ description: 'When the transaction was completed' })
  completedAt?: Date
}

export class Sep24HistoryResponseDto {
  @ApiProperty({ type: [Sep24HistoryItemDto], description: 'List of anchor transactions' })
  items: Sep24HistoryItemDto[]

  @ApiProperty({ description: 'Total number of matching records' })
  total: number

  @ApiProperty({ description: 'Page number returned' })
  page: number

  @ApiProperty({ description: 'Items per page' })
  limit: number
}
