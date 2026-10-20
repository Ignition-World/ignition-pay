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
var ProposalLifecycleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalLifecycleService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const proposal_entity_1 = require("../entities/proposal.entity");
/**
 * Scheduled job that advances the proposal lifecycle without manual
 * intervention:
 *
 * - `draft` proposals whose voting window has opened are activated
 * - `active` proposals whose voting window has elapsed are tallied and
 *   closed (passed/rejected based on quorum + majority)
 */
let ProposalLifecycleService = ProposalLifecycleService_1 = class ProposalLifecycleService {
    constructor(proposalRepository) {
        this.proposalRepository = proposalRepository;
        this.logger = new common_1.Logger(ProposalLifecycleService_1.name);
    }
    /**
     * Run hourly to open due drafts and close expired active proposals.
     */
    async processLifecycle() {
        this.logger.log('Starting proposal lifecycle processing...');
        const now = new Date();
        // Open drafts whose voting window has started.
        const dueDrafts = await this.proposalRepository.find({
            where: {
                status: proposal_entity_1.ProposalStatus.DRAFT,
                votingStartsAt: (0, typeorm_2.LessThanOrEqual)(now),
            },
        });
        for (const proposal of dueDrafts) {
            proposal.status = proposal_entity_1.ProposalStatus.ACTIVE;
            await this.proposalRepository.save(proposal);
        }
        // Close active proposals whose voting window has ended.
        const expiredActives = await this.proposalRepository.find({
            where: {
                status: proposal_entity_1.ProposalStatus.ACTIVE,
                votingEndsAt: (0, typeorm_2.LessThanOrEqual)(now),
            },
        });
        let closed = 0;
        for (const proposal of expiredActives) {
            const totalVotes = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
            const quorumMet = proposal.eligibleVoters > 0 &&
                totalVotes / proposal.eligibleVoters >=
                    proposal.quorumThresholdPercent / 100;
            if (!quorumMet || proposal.yesVotes <= proposal.noVotes) {
                proposal.status = proposal_entity_1.ProposalStatus.REJECTED;
            }
            else {
                proposal.status = proposal_entity_1.ProposalStatus.PASSED;
            }
            proposal.tallyExecutedAt = now;
            await this.proposalRepository.save(proposal);
            closed += 1;
        }
        this.logger.log(`Proposal lifecycle processed: ${dueDrafts.length} activated, ${closed} closed.`);
        return { activated: dueDrafts.length, closed };
    }
};
exports.ProposalLifecycleService = ProposalLifecycleService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR)
], ProposalLifecycleService.prototype, "processLifecycle", null);
exports.ProposalLifecycleService = ProposalLifecycleService = ProposalLifecycleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(proposal_entity_1.Proposal))
], ProposalLifecycleService);
