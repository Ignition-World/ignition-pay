import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDecimalAmount,
  MINIMUM_PAYMENT_AMOUNT,
} from '../../common/decorators/is-decimal-amount.decorator';

export class CreatePaymentDto {
  @ApiProperty({ description: 'ID of the sender wallet (must belong to the authenticated user)' })
  @IsUUID()
  @IsNotEmpty()
  senderWalletId: string;

  @ApiProperty({ description: 'Recipient Stellar address' })
  @IsString()
  @IsNotEmpty()
  recipientAddress: string;

  @ApiProperty({
    description:
      `Payment amount as a decimal string. ` +
      `Must be >= ${MINIMUM_PAYMENT_AMOUNT} (one stroop), ` +
      `at most 7 decimal places, and at most 20 total significant digits.`,
    example: '10.5000000',
  })
  @IsDecimalAmount()
  amount: string;

  @ApiProperty({ description: 'Asset code (e.g. XLM, USDC)' })
  @IsString()
  @IsNotEmpty()
  assetCode: string;

  /**
   * Client-supplied idempotency key (Issue #408).
   *
   * When provided, the server will reject any duplicate initiation request
   * that carries the same key within the current processing window, preventing
   * network-retry double-submits from creating duplicate on-chain payments.
   *
   * If omitted the server falls back to a best-effort de-duplication based on
   * sender/recipient/amount/assetCode within the last 60 seconds.
   */
  @ApiProperty({
    description:
      'Optional idempotency key supplied by the client. ' +
      'Duplicate requests with the same key are rejected within a short window.',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
