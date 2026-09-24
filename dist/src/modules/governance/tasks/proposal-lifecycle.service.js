"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalLifecycleService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("typeorm");
const proposal_entity_1 = require("../entities/proposal.entity");
/**
 * Scheduled job that advances the proposal lifecycle without manual
 * intervention:
 *
 * - `draft` proposals whose voting window has opened are activated
 * - `active` proposals whose voting window has elapsed are tallied and
 *   closed (passed/rejected based on quorum + majority)
 */
let ProposalLifecycleService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _processLifecycle_decorators;
    var ProposalLifecycleService = _classThis = class {
        constructor(proposalRepository) {
            this.proposalRepository = (__runInitializers(this, _instanceExtraInitializers), proposalRepository);
            this.logger = new common_1.Logger(ProposalLifecycleService.name);
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
                    votingStartsAt: (0, typeorm_1.LessThanOrEqual)(now),
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
                    votingEndsAt: (0, typeorm_1.LessThanOrEqual)(now),
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
    __setFunctionName(_classThis, "ProposalLifecycleService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _processLifecycle_decorators = [(0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR)];
        __esDecorate(_classThis, null, _processLifecycle_decorators, { kind: "method", name: "processLifecycle", static: false, private: false, access: { has: obj => "processLifecycle" in obj, get: obj => obj.processLifecycle }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ProposalLifecycleService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ProposalLifecycleService = _classThis;
})();
exports.ProposalLifecycleService = ProposalLifecycleService;
