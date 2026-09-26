"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceService = void 0;
const common_1 = require("@nestjs/common");
const proposal_entity_1 = require("./entities/proposal.entity");
const vote_entity_1 = require("./entities/vote.entity");
let GovernanceService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var GovernanceService = _classThis = class {
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
    __setFunctionName(_classThis, "GovernanceService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GovernanceService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GovernanceService = _classThis;
})();
exports.GovernanceService = GovernanceService;
