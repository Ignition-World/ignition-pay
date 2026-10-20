"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Proposal = exports.ProposalStatus = void 0;
const typeorm_1 = require("typeorm");
/**
 * Lifecycle states enforced by the governance service.
 *
 * draft    → created, not yet open for voting
 * active   → voting window is open (votingStartsAt <= now <= votingEndsAt)
 * passed   → voting window closed, quorum met and yes votes outnumber no votes
 * executed → a passed proposal has been executed
 * rejected → voting window closed without quorum, or yes votes did not win
 */
var ProposalStatus;
(function (ProposalStatus) {
    ProposalStatus["DRAFT"] = "draft";
    ProposalStatus["ACTIVE"] = "active";
    ProposalStatus["PASSED"] = "passed";
    ProposalStatus["EXECUTED"] = "executed";
    ProposalStatus["REJECTED"] = "rejected";
})(ProposalStatus || (exports.ProposalStatus = ProposalStatus = {}));
let Proposal = class Proposal {
};
exports.Proposal = Proposal;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid')
], Proposal.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 })
], Proposal.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' })
], Proposal.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: ProposalStatus.DRAFT })
], Proposal.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' })
], Proposal.prototype, "votingStartsAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp' })
], Proposal.prototype, "votingEndsAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 20 })
], Proposal.prototype, "quorumThresholdPercent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 })
], Proposal.prototype, "eligibleVoters", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 })
], Proposal.prototype, "yesVotes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 })
], Proposal.prototype, "noVotes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 })
], Proposal.prototype, "abstainVotes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true })
], Proposal.prototype, "tallyExecutedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true })
], Proposal.prototype, "executedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp' })
], Proposal.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp' })
], Proposal.prototype, "updatedAt", void 0);
exports.Proposal = Proposal = __decorate([
    (0, typeorm_1.Entity)('proposals')
], Proposal);
