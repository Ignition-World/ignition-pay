import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Fee-bump fields for payment DTO (Issue #416).
 * Allows the caller to supply a fee-bump base fee and source account
 * so the server can wrap the inner transaction in a fee-bump envelope.
 */
export class FeeBumpPaymentDto {
  @ApiProperty({ description: 'Fee-bump base fee in stroops (e.g. "1000")', required: false })
  @IsOptional()
  @IsString()
  feeBumpBaseFee?: string;

  @ApiProperty({ description: 'Fee-bump source account (Stellar G... address)', required: false })
  @IsOptional()
  @IsString()
  feeBumpSourceAccount?: string;
}