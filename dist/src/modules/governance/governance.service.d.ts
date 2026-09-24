import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { Vote } from './entities/vote.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ProposalResultsDto } from './dto/proposal-status.dto';
export declare class GovernanceService {
    private readonly proposalRepository;
    private readonly voteRepository;
    private readonly userRepository;
    constructor(proposalRepository: Repository<Proposal>, voteRepository: Repository<Vote>, userRepository: Repository<User>);
    /**
     * Create a proposal in `draft` state with a time-bound voting window.
     * The eligible electorate is snapshotted at creation so quorum can be
     * evaluated deterministically later.
     */
    createProposal(dto: CreateProposalDto): Promise<Proposal>;
    /**
     * List proposals, optionally filtered by lifecycle status.
     */
    listProposals(status?: ProposalStatus): Promise<Proposal[]>;
    /**
     * Get a proposal by id.
     */
    getProposal(id: string): Promise<Proposal>;
    /**
     * Move a proposal from `draft` to `active`. Activation is only allowed
     * once the voting window has opened (time-bound window enforcement).
     */
    activateProposal(id: string): Promise<Proposal>;
    /**
     * Cast a vote on an active proposal. Votes are only accepted while the
     * proposal is `active` and within its time-bound voting window, and a
     * voter may only vote once per proposal.
     */
    castVote(proposalId: string, dto: CastVoteDto): Promise<Proposal>;
    /**
     * Close an active proposal once its voting window has elapsed and
     * evaluate the outcome:
     *
     * - If participation (quorum enforcement) is below the configured
     *   threshold the proposal is REJECTED and can never be executed.
     * - Otherwise the outcome follows the majority: yes > no → PASSED,
     *   otherwise → REJECTED.
     */
    tallyAndClose(id: string): Promise<Proposal>;
    /**
     * Execute a passed proposal. Only proposals that reached `passed`
     * (which itself requires quorum to have been met) can be executed.
     */
    executeProposal(id: string): Promise<Proposal>;
    /**
     * Compute live participation and quorum status for a proposal.
     */
    getResults(id: string): Promise<ProposalResultsDto>;
    /**
     * Minimum participation threshold check: at least
     * quorumThresholdPercent% of the eligible electorate must have voted
     * (including abstentions) for the outcome to be valid.
     */
    private isQuorumMet;
}
