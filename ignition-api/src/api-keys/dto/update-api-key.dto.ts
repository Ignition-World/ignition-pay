import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateApiKeyDto {
  @ApiPropertyOptional({
    description:
      'New human-readable label. Scope, prefix and status are not mutable through this endpoint — ' +
      'use POST /api-keys/:id/rotate to issue a new key.',
    minLength: 1,
    maxLength: 100,
    example: 'Settlement service (staging)',
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
