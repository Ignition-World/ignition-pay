export declare enum VoteChoice {
    YES = "yes",
    NO = "no",
    ABSTAIN = "abstain"
}
export declare class Vote {
    id: string;
    proposalId: string;
    voterId: string;
    choice: VoteChoice;
    /** Vote weight (default 1); a voter may only cast one vote per proposal. */
    weight: number;
    createdAt: Date;
}
