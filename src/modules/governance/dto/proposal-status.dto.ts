import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Proposal } from '../entities/proposal.entity';

/**
 * Read-only view of a proposal's current tally, participation and
 * quorum status.
 */
export class ProposalResultsDto {
  proposal: Proposal;

  @IsInt()
  @Min(0)
  totalVotes: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  participationPercent: number;

  @IsBoolean()
  quorumMet: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredVotes?: number;
}
