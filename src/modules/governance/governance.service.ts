import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Proposal, ProposalStatus } from './entities/proposal.entity';
import { Vote, VoteChoice } from './entities/vote.entity';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ProposalResultsDto } from './dto/proposal-status.dto';

@Injectable()
export class GovernanceService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposalRepository: Repository<Proposal>,
    @InjectRepository(Vote)
    private readonly voteRepository: Repository<Vote>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Create a proposal in `draft` state with a time-bound voting window.
   * The eligible electorate is snapshotted at creation so quorum can be
   * evaluated deterministically later.
   */
  async createProposal(dto: CreateProposalDto): Promise<Proposal> {
    const votingStartsAt = new Date(dto.votingStartsAt);
    const votingEndsAt = new Date(dto.votingEndsAt);

    if (Number.isNaN(votingStartsAt.getTime()) || Number.isNaN(votingEndsAt.getTime())) {
      throw new BadRequestException('votingStartsAt and votingEndsAt must be valid dates');
    }

    if (votingEndsAt <= votingStartsAt) {
      throw new BadRequestException('votingEndsAt must be after votingStartsAt');
    }

    if (votingStartsAt.getTime() < Date.now()) {
      throw new BadRequestException('votingStartsAt must be in the future');
    }

    // Snapshot the active electorate for quorum evaluation.
    const eligibleVoters = await this.userRepository.count();

    const proposal = this.proposalRepository.create({
      title: dto.title,
      description: dto.description,
      votingStartsAt,
      votingEndsAt,
      quorumThresholdPercent: dto.quorumThresholdPercent,
      eligibleVoters,
      status: ProposalStatus.DRAFT,
      yesVotes: 0,
      noVotes: 0,
      abstainVotes: 0,
    });

    return this.proposalRepository.save(proposal);
  }

  /**
   * List proposals, optionally filtered by lifecycle status.
   */
  async listProposals(status?: ProposalStatus): Promise<Proposal[]> {
    if (status && !Object.values(ProposalStatus).includes(status)) {
      throw new BadRequestException(`Invalid proposal status: ${status}`);
    }
    return this.proposalRepository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a proposal by id.
   */
  async getProposal(id: string): Promise<Proposal> {
    const proposal = await this.proposalRepository.findOne({ where: { id } });
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID ${id} not found`);
    }
    return proposal;
  }

  /**
   * Move a proposal from `draft` to `active`. Activation is only allowed
   * once the voting window has opened (time-bound window enforcement).
   */
  async activateProposal(id: string): Promise<Proposal> {
    const proposal = await this.getProposal(id);

    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new ConflictException(
        `Only draft proposals can be activated; current status is ${proposal.status}`,
      );
    }

    if (Date.now() < proposal.votingStartsAt.getTime()) {
      throw new BadRequestException(
        `Proposal cannot be activated before voting starts at ${proposal.votingStartsAt.toISOString()}`,
      );
    }

    proposal.status = ProposalStatus.ACTIVE;
    return this.proposalRepository.save(proposal);
  }

  /**
   * Cast a vote on an active proposal. Votes are only accepted while the
   * proposal is `active` and within its time-bound voting window, and a
   * voter may only vote once per proposal.
   */
  async castVote(proposalId: string, dto: CastVoteDto): Promise<Proposal> {
    const proposal = await this.getProposal(proposalId);

    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new ConflictException(
        `Voting is only open while a proposal is active; current status is ${proposal.status}`,
      );
    }

    const now = Date.now();
    if (now < proposal.votingStartsAt.getTime()) {
      throw new BadRequestException('Voting window has not opened yet');
    }
    if (now > proposal.votingEndsAt.getTime()) {
      throw new BadRequestException('Voting window has closed');
    }

    const existing = await this.voteRepository.findOne({
      where: { proposalId, voterId: dto.voterId },
    });
    if (existing) {
      throw new ConflictException('Voter has already cast a vote for this proposal');
    }

    const weight = dto.weight ?? 1;
    const vote = this.voteRepository.create({
      proposalId,
      voterId: dto.voterId,
      choice: dto.choice,
      weight,
    });
    await this.voteRepository.save(vote);

    if (dto.choice === VoteChoice.YES) {
      proposal.yesVotes += weight;
    } else if (dto.choice === VoteChoice.NO) {
      proposal.noVotes += weight;
    } else {
      proposal.abstainVotes += weight;
    }

    return this.proposalRepository.save(proposal);
  }

  /**
   * Close an active proposal once its voting window has elapsed and
   * evaluate the outcome:
   *
   * - If participation (quorum enforcement) is below the configured
   *   threshold the proposal is REJECTED and can never be executed.
   * - Otherwise the outcome follows the majority: yes > no → PASSED,
   *   otherwise → REJECTED.
   */
  async tallyAndClose(id: string): Promise<Proposal> {
    const proposal = await this.getProposal(id);

    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new ConflictException(
        `Only active proposals can be tallied; current status is ${proposal.status}`,
      );
    }

    if (Date.now() < proposal.votingEndsAt.getTime()) {
      throw new BadRequestException(
        `Proposal cannot be tallied before voting ends at ${proposal.votingEndsAt.toISOString()}`,
      );
    }

    const quorumMet = this.isQuorumMet(proposal);

    if (!quorumMet) {
      // Quorum not reached — the outcome must not execute.
      proposal.status = ProposalStatus.REJECTED;
    } else if (proposal.yesVotes > proposal.noVotes) {
      proposal.status = ProposalStatus.PASSED;
    } else {
      proposal.status = ProposalStatus.REJECTED;
    }

    proposal.tallyExecutedAt = new Date();
    return this.proposalRepository.save(proposal);
  }

  /**
   * Execute a passed proposal. Only proposals that reached `passed`
   * (which itself requires quorum to have been met) can be executed.
   */
  async executeProposal(id: string): Promise<Proposal> {
    const proposal = await this.getProposal(id);

    if (proposal.status !== ProposalStatus.PASSED) {
      throw new ConflictException(
        `Only passed proposals can be executed; current status is ${proposal.status}`,
      );
    }

    proposal.status = ProposalStatus.EXECUTED;
    proposal.executedAt = new Date();
    return this.proposalRepository.save(proposal);
  }

  /**
   * Compute live participation and quorum status for a proposal.
   */
  async getResults(id: string): Promise<ProposalResultsDto> {
    const proposal = await this.getProposal(id);

    const totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
    const participationPercent =
      proposal.eligibleVoters > 0 ? (totalVotes / proposal.eligibleVoters) * 100 : 0;

    return {
      proposal,
      totalVotes,
      participationPercent: Math.round(participationPercent * 100) / 100,
      quorumMet: this.isQuorumMet(proposal),
      requiredVotes: Math.ceil(
        (proposal.quorumThresholdPercent / 100) * proposal.eligibleVoters,
      ),
    };
  }

  /**
   * Minimum participation threshold check: at least
   * quorumThresholdPercent% of the eligible electorate must have voted
   * (including abstentions) for the outcome to be valid.
   */
  private isQuorumMet(proposal: Proposal): boolean {
    if (proposal.eligibleVoters <= 0) {
      // No eligible electorate — nothing can satisfy quorum.
      return proposal.quorumThresholdPercent <= 0;
    }

    const totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
    const participation = totalVotes / proposal.eligibleVoters;
    return participation >= proposal.quorumThresholdPercent / 100;
  }
}
