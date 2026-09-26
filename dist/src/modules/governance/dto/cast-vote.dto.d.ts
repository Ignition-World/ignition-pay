import { VoteChoice } from '../entities/vote.entity';
export declare class CastVoteDto {
    voterId: string;
    choice: VoteChoice;
    /** Optional vote weight; defaults to 1 when omitted. */
    weight?: number;
}
