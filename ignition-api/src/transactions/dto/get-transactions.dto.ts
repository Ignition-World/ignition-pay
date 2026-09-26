import { Type } from 'class-transformer';
import {
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsString,
  IsEnum,
  IsIn,
  IsDateString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WalletNetwork } from '../../wallets/dto/create-wallet.dto';

/**
 * Query DTO for GET /transactions (Issue #586).
 *
 * Uses cursor-based pagination — `cursor` is an opaque token returned in
 * `nextCursor` from the previous response.  Omit to fetch the first page.
 * Offset-based `page` / `skip` fields are not supported.
 */
export class GetTransactionsQueryDto {
  /**
   * Opaque pagination cursor returned by the previous response as `nextCursor`.
   * Omit (or leave empty) to fetch the first page.
   */
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Number of records to return per page.  Defaults to 20, maximum 100.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'])
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  /**
   * Filter by asset code, e.g. "XLM", "USDC".
   * Case-insensitive exact match against the transaction's assetCode.
   */
  @IsOptional()
  @IsString()
  asset?: string;

  /**
   * Free-text search over counterparty wallet address and tx hash.
   * Partial, case-insensitive match.
   */
  @IsOptional()
  @IsString()
  search?: string;
}

export class TransactionDto {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  /** Amount as string to preserve Decimal(20,7) precision (Issue #409) */
  amount: string;
  assetCode: string;
  assetIssuer?: string | null;
  network?: WalletNetwork;
  feeAmount?: string;
  feeAssetCode?: string;
  stellarTxHash: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class GetTransactionsResponseDto {
  data: TransactionDto[];
  /**
   * Opaque cursor to pass as `cursor` on the next request.
   * Null when there are no more pages.
   */
  nextCursor: string | null;
  /** True when another page of results exists after this one. */
  hasMore: boolean;
  /** The page size used for this response. */
  limit: number;
}

export class SubmitTransactionDto {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  assetCode?: string;
  @ApiPropertyOptional({ enum: WalletNetwork, default: WalletNetwork.STELLAR })
  @IsOptional()
  @IsEnum(WalletNetwork)
  network?: WalletNetwork = WalletNetwork.STELLAR;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetIssuer?: string;
  /** Idempotency key — provide the Stellar tx hash to dedupe retries (#244) */
  stellarTxHash?: string;
}
