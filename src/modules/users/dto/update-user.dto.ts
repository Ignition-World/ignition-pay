import {
  IsString,
  IsOptional,
  IsUrl,
  IsPhoneNumber,
  Length,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 50, { message: 'Display name must be between 2 and 50 characters' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @IsPhoneNumber(undefined, {
    message: 'Phone number must be a valid E.164 formatted number (e.g., +1234567890)',
  })
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL string' })
  avatar?: string;
}