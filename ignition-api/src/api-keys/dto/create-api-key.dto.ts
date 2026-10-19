import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiPropertyOptional({
    description:
      'Human-readable label shown in the API key list. Must not contain HTML tags. ' +
      'Defaults to `API Key <YYYY-MM-DD>`.',
    minLength: 1,
    maxLength: 100,
    example: 'Settlement service',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, {
    message: 'name must not contain HTML tags',
  })
  name?: string;
}
