import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Sep24Operation {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
}

export class InitiateSep24Dto {
  @ApiProperty({ description: 'Anchor name (e.g. "StellarX", "AnchorUSD")' })
  @IsString()
  anchorName: string;

  @ApiProperty({ enum: Sep24Operation })
  @IsEnum(Sep24Operation)
  operation: Sep24Operation;

  @ApiProperty({ description: 'Asset code to deposit/withdraw' })
  @IsString()
  assetCode: string;

  @ApiPropertyOptional({
    description: 'Asset issuer (optional for native assets)',
  })
  @IsString()
  @IsOptional()
  assetIssuer?: string;

  @ApiPropertyOptional({
    description: 'Amount (optional, some anchors allow empty)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @ApiProperty({ description: "User's Stellar account (G...)" })
  @IsString()
  stellarAccount: string;

  @ApiPropertyOptional({
    description:
      'Optional existing transaction ID to resume or re-enter interactive flow (Issue #425)',
  })
  @IsString()
  @IsOptional()
  transactionId?: string;

  @ApiPropertyOptional({
    description:
      'Optional existing transaction ID alias in snake_case per SEP-24 specification (Issue #425)',
  })
  @IsString()
  @IsOptional()
  transaction_id?: string;
}

export class Sep24StatusDto {
  @ApiProperty({ description: 'Internal SEP-24 transaction ID' })
  @IsString()
  id: string;
}

export class GetSep24HistoryQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    enum: Sep24Operation,
    description: 'Filter by operation type',
  })
  @IsEnum(Sep24Operation)
  @IsOptional()
  operation?: Sep24Operation;

  @ApiPropertyOptional({ description: 'Filter by anchor name' })
  @IsString()
  @IsOptional()
  anchorName?: string;
}
