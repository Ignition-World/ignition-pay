import { Proposal } from '../entities/proposal.entity';
/**
 * Read-only view of a proposal's current tally, participation and
 * quorum status.
 */
export declare class ProposalResultsDto {
    proposal: Proposal;
    totalVotes: number;
    participationPercent: number;
    quorumMet: boolean;
    requiredVotes?: number;
}
