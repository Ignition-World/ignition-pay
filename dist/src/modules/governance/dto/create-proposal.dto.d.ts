export declare class CreateProposalDto {
    title: string;
    description: string;
    /** Voting window start (ISO 8601). */
    votingStartsAt: string;
    /** Voting window end (ISO 8601). Must be after votingStartsAt. */
    votingEndsAt: string;
    /** Minimum participation threshold as a percentage of eligible voters (0-100). */
    quorumThresholdPercent: number;
}
