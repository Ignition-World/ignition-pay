import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, {
    message: 'name must not contain HTML tags',
  })
  name?: string;
}
