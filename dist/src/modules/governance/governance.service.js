"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../users/entities/user.entity");
const proposal_entity_1 = require("./entities/proposal.entity");
const vote_entity_1 = require("./entities/vote.entity");
let GovernanceService = class GovernanceService {
    constructor(proposalRepository, voteRepository, userRepository) {
        this.proposalRepository = proposalRepository;
        this.voteRepository = voteRepository;
        this.userRepository = userRepository;
    }
    /**
     * Create a proposal in `draft` state with a time-bound voting window.
     * The eligible electorate is snapshotted at creation so quorum can be
     * evaluated deterministically later.
     */
    async createProposal(dto) {
        const votingStartsAt = new Date(dto.votingStartsAt);
        const votingEndsAt = new Date(dto.votingEndsAt);
        if (Number.isNaN(votingStartsAt.getTime()) || Number.isNaN(votingEndsAt.getTime())) {
            throw new common_1.BadRequestException('votingStartsAt and votingEndsAt must be valid dates');
        }
        if (votingEndsAt <= votingStartsAt) {
            throw new common_1.BadRequestException('votingEndsAt must be after votingStartsAt');
        }
        if (votingStartsAt.getTime() < Date.now()) {
            throw new common_1.BadRequestException('votingStartsAt must be in the future');
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
            status: proposal_entity_1.ProposalStatus.DRAFT,
            yesVotes: 0,
            noVotes: 0,
            abstainVotes: 0,
        });
        return this.proposalRepository.save(proposal);
    }
    /**
     * List proposals, optionally filtered by lifecycle status.
     */
    async listProposals(status) {
        if (status && !Object.values(proposal_entity_1.ProposalStatus).includes(status)) {
            throw new common_1.BadRequestException(`Invalid proposal status: ${status}`);
        }
        return this.proposalRepository.find({
            where: status ? { status } : {},
            order: { createdAt: 'DESC' },
        });
    }
    /**
     * Get a proposal by id.
     */
    async getProposal(id) {
        const proposal = await this.proposalRepository.findOne({ where: { id } });
        if (!proposal) {
            throw new common_1.NotFoundException(`Proposal with ID ${id} not found`);
        }
        return proposal;
    }
    /**
     * Move a proposal from `draft` to `active`. Activation is only allowed
     * once the voting window has opened (time-bound window enforcement).
     */
    async activateProposal(id) {
        const proposal = await this.getProposal(id);
        if (proposal.status !== proposal_entity_1.ProposalStatus.DRAFT) {
            throw new common_1.ConflictException(`Only draft proposals can be activated; current status is ${proposal.status}`);
        }
        if (Date.now() < proposal.votingStartsAt.getTime()) {
            throw new common_1.BadRequestException(`Proposal cannot be activated before voting starts at ${proposal.votingStartsAt.toISOString()}`);
        }
        proposal.status = proposal_entity_1.ProposalStatus.ACTIVE;
        return this.proposalRepository.save(proposal);
    }
    /**
     * Cast a vote on an active proposal. Votes are only accepted while the
     * proposal is `active` and within its time-bound voting window, and a
     * voter may only vote once per proposal.
     */
    async castVote(proposalId, dto) {
        const proposal = await this.getProposal(proposalId);
        if (proposal.status !== proposal_entity_1.ProposalStatus.ACTIVE) {
            throw new common_1.ConflictException(`Voting is only open while a proposal is active; current status is ${proposal.status}`);
        }
        const now = Date.now();
        if (now < proposal.votingStartsAt.getTime()) {
            throw new common_1.BadRequestException('Voting window has not opened yet');
        }
        if (now > proposal.votingEndsAt.getTime()) {
            throw new common_1.BadRequestException('Voting window has closed');
        }
        const existing = await this.voteRepository.findOne({
            where: { proposalId, voterId: dto.voterId },
        });
        if (existing) {
            throw new common_1.ConflictException('Voter has already cast a vote for this proposal');
        }
        const weight = dto.weight ?? 1;
        const vote = this.voteRepository.create({
            proposalId,
            voterId: dto.voterId,
            choice: dto.choice,
            weight,
        });
        await this.voteRepository.save(vote);
        if (dto.choice === vote_entity_1.VoteChoice.YES) {
            proposal.yesVotes += weight;
        }
        else if (dto.choice === vote_entity_1.VoteChoice.NO) {
            proposal.noVotes += weight;
        }
        else {
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
    async tallyAndClose(id) {
        const proposal = await this.getProposal(id);
        if (proposal.status !== proposal_entity_1.ProposalStatus.ACTIVE) {
            throw new common_1.ConflictException(`Only active proposals can be tallied; current status is ${proposal.status}`);
        }
        if (Date.now() < proposal.votingEndsAt.getTime()) {
            throw new common_1.BadRequestException(`Proposal cannot be tallied before voting ends at ${proposal.votingEndsAt.toISOString()}`);
        }
        const quorumMet = this.isQuorumMet(proposal);
        if (!quorumMet) {
            // Quorum not reached — the outcome must not execute.
            proposal.status = proposal_entity_1.ProposalStatus.REJECTED;
        }
        else if (proposal.yesVotes > proposal.noVotes) {
            proposal.status = proposal_entity_1.ProposalStatus.PASSED;
        }
        else {
            proposal.status = proposal_entity_1.ProposalStatus.REJECTED;
        }
        proposal.tallyExecutedAt = new Date();
        return this.proposalRepository.save(proposal);
    }
    /**
     * Execute a passed proposal. Only proposals that reached `passed`
     * (which itself requires quorum to have been met) can be executed.
     */
    async executeProposal(id) {
        const proposal = await this.getProposal(id);
        if (proposal.status !== proposal_entity_1.ProposalStatus.PASSED) {
            throw new common_1.ConflictException(`Only passed proposals can be executed; current status is ${proposal.status}`);
        }
        proposal.status = proposal_entity_1.ProposalStatus.EXECUTED;
        proposal.executedAt = new Date();
        return this.proposalRepository.save(proposal);
    }
    /**
     * Compute live participation and quorum status for a proposal.
     */
    async getResults(id) {
        const proposal = await this.getProposal(id);
        const totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
        const participationPercent = proposal.eligibleVoters > 0 ? (totalVotes / proposal.eligibleVoters) * 100 : 0;
        return {
            proposal,
            totalVotes,
            participationPercent: Math.round(participationPercent * 100) / 100,
            quorumMet: this.isQuorumMet(proposal),
            requiredVotes: Math.ceil((proposal.quorumThresholdPercent / 100) * proposal.eligibleVoters),
        };
    }
    /**
     * Minimum participation threshold check: at least
     * quorumThresholdPercent% of the eligible electorate must have voted
     * (including abstentions) for the outcome to be valid.
     */
    isQuorumMet(proposal) {
        if (proposal.eligibleVoters <= 0) {
            // No eligible electorate — nothing can satisfy quorum.
            return proposal.quorumThresholdPercent <= 0;
        }
        const totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
        const participation = totalVotes / proposal.eligibleVoters;
        return participation >= proposal.quorumThresholdPercent / 100;
    }
};
exports.GovernanceService = GovernanceService;
exports.GovernanceService = GovernanceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(proposal_entity_1.Proposal)),
    __param(1, (0, typeorm_1.InjectRepository)(vote_entity_1.Vote)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User))
], GovernanceService);
