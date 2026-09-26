/**
 * Lifecycle states enforced by the governance service.
 *
 * draft    → created, not yet open for voting
 * active   → voting window is open (votingStartsAt <= now <= votingEndsAt)
 * passed   → voting window closed, quorum met and yes votes outnumber no votes
 * executed → a passed proposal has been executed
 * rejected → voting window closed without quorum, or yes votes did not win
 */
export declare enum ProposalStatus {
    DRAFT = "draft",
    ACTIVE = "active",
    PASSED = "passed",
    EXECUTED = "executed",
    REJECTED = "rejected"
}
export declare class Proposal {
    id: string;
    title: string;
    description: string;
    status: ProposalStatus;
    /** Voting window start (ISO). Votes before this are rejected. */
    votingStartsAt: Date;
    /** Voting window end (ISO). Votes after this are rejected. */
    votingEndsAt: Date;
    /**
     * Minimum participation, as a percentage of the eligible electorate
     * (0-100), required for a proposal outcome to be valid. If the
     * participation threshold is not met the proposal is rejected and can
     * never be executed (quorum enforcement).
     */
    quorumThresholdPercent: number;
    /**
     * Snapshot of the eligible electorate taken when the proposal was
     * created. Quorum is evaluated against this snapshot so later changes
     * to the user base cannot inflate or deflate participation.
     */
    eligibleVoters: number;
    yesVotes: number;
    noVotes: number;
    abstainVotes: number;
    /** Timestamp of the tally that moved the proposal out of `active`. */
    tallyExecutedAt?: Date | null;
    /** Timestamp of execution for `passed` proposals. */
    executedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
