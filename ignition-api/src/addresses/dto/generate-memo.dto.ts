import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MemoTypeOption {
  ID = 'id',
  TEXT = 'text',
  HASH = 'hash',
}

export class GenerateMemoDto {
  @ApiProperty({
    description: 'Wallet ID to generate deposit memo for',
  })
  @IsString()
  walletId: string;

  @ApiPropertyOptional({
    enum: MemoTypeOption,
    default: MemoTypeOption.ID,
    description: 'Memo type: id, text, or hash',
  })
  @IsEnum(MemoTypeOption)
  @IsOptional()
  memoType?: MemoTypeOption = MemoTypeOption.ID;

  @ApiPropertyOptional({
    description: 'Custom string or seed for text or hash memo generation',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  customValue?: string;
}
