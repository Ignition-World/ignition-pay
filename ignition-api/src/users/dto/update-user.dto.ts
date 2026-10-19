import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsEmail,
  IsUrl,
  IsJSON,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isValidDateOfBirth', async: false })
export class IsValidDateOfBirthConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any) {
    if (value === undefined || value === null || value === '') return true;

    let date: Date;
    if (typeof value === 'number') {
      if (value > 1900 && value <= 2200) {
        date = new Date(value, 0, 1);
      } else {
        date = new Date(value);
      }
    } else if (typeof value === 'string' || value instanceof Date) {
      date = new Date(value);
    } else {
      return false;
    }

    if (isNaN(date.getTime())) return false;

    const now = new Date();
    // Cannot be in the future (e.g. 2080)
    if (date > now) return false;

    // Anchor's age-gate: user must be at least 18 years old
    const minAgeDate = new Date(
      now.getFullYear() - 18,
      now.getMonth(),
      now.getDate(),
    );
    if (date > minAgeDate) return false;

    // Maximum reasonable age (120 years)
    const maxAgeDate = new Date(
      now.getFullYear() - 120,
      now.getMonth(),
      now.getDate(),
    );
    if (date < maxAgeDate) return false;

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a valid past date and user must be at least 18 years old`;
  }
}

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

  @IsOptional()
  @Validate(IsValidDateOfBirthConstraint)
  date_of_birth?: string | number | Date;

  @IsOptional()
  @Validate(IsValidDateOfBirthConstraint)
  dateOfBirth?: string | number | Date;
}
