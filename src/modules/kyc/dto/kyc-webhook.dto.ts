import { IsString, IsEnum, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export enum KycStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REQUIRES_ACTION = 'REQUIRES_ACTION',
}

export class KycWebhookDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  applicantId: string;

  @IsEnum(KycStatus)
  status: KycStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}