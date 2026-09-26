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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletNetwork } from '../../wallets/dto/create-wallet.dto';

/**
 * Statuses the backend accepts for `GET /transactions?status=`.
 *
 * Source of truth is the `TransactionStatus` enum in `prisma/schema.prisma`;
 * `Status` on the returned DTO carries the same value, so these are exactly the
 * values a client will also observe in the response body.
 */
export const TRANSACTION_STATUS_VALUES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;

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
  @ApiPropertyOptional({
    description:
      'Opaque cursor from `nextCursor` of the previous page. Omit to fetch the first page. ' +
      'The value is a base64 token — do not parse it or persist it beyond the current pagination session.',
    example: 'dHhuLTEyMw==',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Number of records to return per page.  Defaults to 20, maximum 100.
   */
  @ApiPropertyOptional({
    description: 'Page size.',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Only return transactions created at or after this timestamp (inclusive). Any ISO-8601 value is accepted; a bare date such as `2026-01-01` is treated as UTC midnight.',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description:
      'Only return transactions created at or before this timestamp (inclusive).',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Filter by lifecycle status. Omit to return every status. These are the same values returned in `status` on each record.',
    enum: [...TRANSACTION_STATUS_VALUES],
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsString()
  @IsIn([...TRANSACTION_STATUS_VALUES])
  status?: string;

  @ApiPropertyOptional({
    description:
      'Legacy alias for `asset`. `asset` wins when both are supplied. Kept because existing clients send `type`.',
    example: 'USDC',
  })
  @IsOptional()
  @IsString()
  type?: string;

  /**
   * Filter by asset code, e.g. "XLM", "USDC".
   * Case-insensitive exact match against the transaction's assetCode.
   */
  @ApiPropertyOptional({
    description:
      'Filter by asset code. Case-insensitive exact match against the transaction asset.',
    example: 'XLM',
  })
  @IsOptional()
  @IsString()
  asset?: string;

  /**
   * Free-text search over counterparty wallet address and tx hash.
   * Partial, case-insensitive match.
   */
  @ApiPropertyOptional({
    description:
      'Free-text search. Matches the Stellar tx hash exactly (case-insensitive) or the from/to wallet ids partially.',
    example: 'GABCDEF',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class TransactionDto {
  @ApiProperty({ description: 'Transaction id.', example: 'b7c1f0c2-1f0a-4f2b-9f0e-2b7d0a1c4e55' })
  id: string;

  @ApiProperty({
    description: 'Id of the wallet the funds left.',
    example: '3a1b6c9e-6d21-4a3e-8f77-9d2c1f0a5b84',
  })
  fromWalletId: string;

  @ApiProperty({
    description: 'Id of the wallet the funds arrived in.',
    example: '9c4d2e70-4b8a-4c3d-9a51-6e0f2b7d8c19',
  })
  toWalletId: string;

  /** Amount as string to preserve Decimal(20,7) precision (Issue #409) */
  @ApiProperty({
    description:
      'Amount as a string, preserving the Decimal(20,7) precision of the column (Issue #409).',
    example: '50.0000000',
  })
  amount: string;

  @ApiProperty({ description: 'Asset code, upper-cased.', example: 'XLM' })
  assetCode: string;

  @ApiProperty({
    description: 'Asset issuer account, when the asset is not the native coin.',
    example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    nullable: true,
    required: false,
  })
  assetIssuer?: string | null;

  @ApiPropertyOptional({
    description: 'Network the transfer was submitted on.',
    enum: WalletNetwork,
    example: WalletNetwork.STELLAR,
  })
  network?: WalletNetwork;

  @ApiPropertyOptional({
    description: 'Network fee charged for this transfer, as a string.',
    example: '0.0000100',
  })
  feeAmount?: string;

  @ApiPropertyOptional({
    description: 'Asset the fee was charged in.',
    example: 'XLM',
  })
  feeAssetCode?: string;

  @ApiProperty({
    description:
      'Stellar transaction hash. Null until the hash is known, and used as the natural idempotency key (Issue #244).',
    example: '4a1b6c9e6d214a3e8f779d2c1f0a5b84c3d2e1709a5b4c6d7e8f90a1b2c3d4e5f',
    nullable: true,
  })
  stellarTxHash: string | null;

  @ApiProperty({
    description: 'Lifecycle status. One of the values accepted by the `status` filter.',
    enum: [...TRANSACTION_STATUS_VALUES],
    example: 'PENDING',
  })
  status: string;

  @ApiProperty({
    description: 'Creation timestamp. Results are ordered by this, newest first.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last modification timestamp.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:05.000Z',
  })
  updatedAt: Date;
}

export class GetTransactionsResponseDto {
  @ApiProperty({
    type: [TransactionDto],
    description: 'The current page of transactions, newest first.',
  })
  data: TransactionDto[];

  /**
   * Opaque cursor to pass as `cursor` on the next request.
   * Null when there are no more pages.
   */
  @ApiProperty({
    description:
      'Opaque cursor for the next page, or null on the last page. Pass back as `cursor` verbatim.',
    type: String,
    nullable: true,
    example: 'dHhuLTEyMw==',
  })
  nextCursor: string | null;

  /** True when another page of results exists after this one. */
  @ApiProperty({
    description: 'True when more results exist after this page.',
    example: true,
  })
  hasMore: boolean;

  /** The page size used for this response. */
  @ApiProperty({
    description: 'Page size actually applied to this response.',
    example: 20,
  })
  limit: number;
}

/**
 * Response of `POST /transactions`.
 *
 * `alreadyExisted` tells the caller whether a new row was inserted or an
 * existing one was replayed, for either of the two deduplication mechanisms
 * (Issue #244 `stellarTxHash` dedupe and Issue #615 `Idempotency-Key`).
 */
export class SubmitTransactionResponseDto extends TransactionDto {
  @ApiProperty({
    description:
      'False when this call created the transaction; true when an existing record was returned because the submission was a duplicate.',
    example: false,
  })
  alreadyExisted: boolean;
}

export class SubmitTransactionDto {
  @ApiProperty({
    description: 'Id of the wallet to debit.',
    example: '3a1b6c9e-6d21-4a3e-8f77-9d2c1f0a5b84',
  })
  fromWalletId: string;

  @ApiProperty({
    description: 'Id of the wallet to credit.',
    example: '9c4d2e70-4b8a-4c3d-9a51-6e0f2b7d8c19',
  })
  toWalletId: string;

  @ApiProperty({
    description:
      'Amount to transfer, as a decimal string so Decimal(20,7) precision survives the round trip.',
    example: '50.0000000',
  })
  amount: string;

  @ApiPropertyOptional({
    description:
      'Asset code. Defaults to the network native asset (XLM / ETH / BTC). Upper-cased before storage.',
    example: 'XLM',
  })
  @IsOptional()
  @IsString()
  assetCode?: string;

  @ApiPropertyOptional({ enum: WalletNetwork, default: WalletNetwork.STELLAR })
  @IsOptional()
  @IsEnum(WalletNetwork)
  network?: WalletNetwork = WalletNetwork.STELLAR;

  @ApiPropertyOptional({
    description:
      'Asset issuer account. Required for non-native Stellar assets; must be omitted for the native asset and for the Ethereum/Bitcoin networks.',
    example:
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  })
  @IsOptional()
  @IsString()
  assetIssuer?: string;

  /**
   * Idempotency key — provide the Stellar tx hash to dedupe retries (#244)
   */
  @ApiPropertyOptional({
    description:
      'Stellar transaction hash, used to dedupe retries (Issue #244). Submitting the same hash again returns the existing record instead of creating a duplicate. ' +
      'Complements the `Idempotency-Key` request header, which is preferable when the hash is not yet known.',
    example:
      '4a1b6c9e6d214a3e8f779d2c1f0a5b84c3d2e1709a5b4c6d7e8f90a1b2c3d4e5f',
    maxLength: 255,
  })
  stellarTxHash?: string;
}
