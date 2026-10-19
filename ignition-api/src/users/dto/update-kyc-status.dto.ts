import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum KYCStatusEnum {
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  PENDING = 'PENDING',
}

export class UpdateKYCStatusDto {
  @IsEnum(KYCStatusEnum)
  status: KYCStatusEnum;

  @ValidateIf((o: UpdateKYCStatusDto) => o.status === KYCStatusEnum.REJECTED)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
