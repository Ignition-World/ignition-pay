import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, {
    message: 'name must not contain HTML tags',
  })
  name?: string;
}
