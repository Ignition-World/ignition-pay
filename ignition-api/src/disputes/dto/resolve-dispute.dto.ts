import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum DisputeResolutionOutcome {
  REFUNDED = 'REFUNDED',
  REJECTED = 'REJECTED',
}

export class ResolveDisputeDto {
  @IsEnum(DisputeResolutionOutcome)
  @IsNotEmpty()
  outcome: DisputeResolutionOutcome;

  @IsString()
  @IsOptional()
  resolutionNotes?: string;
}