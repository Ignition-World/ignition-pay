import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateMemoDto {
  @ApiProperty({
    description: 'Memo type to validate: id, text, hash, return, or none',
  })
  @IsString()
  memoType: string;

  @ApiPropertyOptional({
    description: 'Memo string value to validate',
    maxLength: 256,
  })
  @IsString()
  @IsOptional()
  @MaxLength(256)
  memoValue?: string;

  @ApiPropertyOptional({
    description: 'Optional destination address (G-address or M-address) to check routing compatibility',
  })
  @IsString()
  @IsOptional()
  destination?: string;
}
