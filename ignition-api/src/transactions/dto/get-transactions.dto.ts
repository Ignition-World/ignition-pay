import { Type } from 'class-transformer';
import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsString,
  IsIn,
  IsDateString,
} from 'class-validator';

export class GetTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'CONFIRMED', 'REFUNDED', 'FAILED'])
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  /**
   * Sort field with optional direction prefix.
   * Prefix with '-' for descending order (e.g. '-createdAt').
   * No prefix means ascending (e.g. 'createdAt').
   * Defaults to '-donatedAt' (newest first).
   */
  @IsOptional()
  @IsString()
  sort?: string;
}

export class TransactionDto {
  id: string;
  amount: number;
  assetCode: string;
  txHash: string | null;
  status: string;
  type: string;
  donorId: string;
  campaignId: string;
  donatedAt: Date;
  confirmedAt: Date | null;
  createdAt: Date;
}

export class GetTransactionsResponseDto {
  data: TransactionDto[];
  total: number;
  page: number;
  limit: number;
}
