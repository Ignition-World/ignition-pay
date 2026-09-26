import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveDepositDto {
  @ApiProperty({
    description: 'Destination deposit address (G-address or M-address)',
  })
  @IsString()
  destination: string;

  @ApiPropertyOptional({
    description: 'Memo type: id, text, hash, return, or none',
  })
  @IsString()
  @IsOptional()
  memoType?: string;

  @ApiPropertyOptional({
    description: 'Memo value string',
    maxLength: 256,
  })
  @IsString()
  @IsOptional()
  @MaxLength(256)
  memoValue?: string;

  @ApiPropertyOptional({
    description: 'Optional Stellar transaction hash for recording',
  })
  @IsString()
  @IsOptional()
  txHash?: string;
}
