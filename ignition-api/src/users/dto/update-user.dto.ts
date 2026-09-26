import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsEmail,
  IsUrl,
  IsJSON,
  Matches,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^<>]*$/, {
    message: 'name must not contain HTML tags',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'phone must be a valid E.164 format',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(5000)
  preferences?: string; // JSON stringified object

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, {
    message: 'bio must not contain HTML tags',
  })
  bio?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(5000)
  socialLinks?: string; // JSON stringified object

  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(5000)
  notificationPreferences?: string; // JSON stringified object
}
