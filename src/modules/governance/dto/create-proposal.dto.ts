import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class CreateProposalDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  description: string;

  /** Voting window start (ISO 8601). */
  @IsDateString()
  votingStartsAt: string;

  /** Voting window end (ISO 8601). Must be after votingStartsAt. */
  @IsDateString()
  votingEndsAt: string;

  /** Minimum participation threshold as a percentage of eligible voters (0-100). */
  @IsInt()
  @Min(0)
  @Max(100)
  quorumThresholdPercent: number;
}
