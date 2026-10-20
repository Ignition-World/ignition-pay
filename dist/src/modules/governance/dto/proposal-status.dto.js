"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalResultsDto = void 0;
const class_validator_1 = require("class-validator");
/**
 * Read-only view of a proposal's current tally, participation and
 * quorum status.
 */
class ProposalResultsDto {
}
exports.ProposalResultsDto = ProposalResultsDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0)
], ProposalResultsDto.prototype, "totalVotes", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100)
], ProposalResultsDto.prototype, "participationPercent", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)()
], ProposalResultsDto.prototype, "quorumMet", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0)
], ProposalResultsDto.prototype, "requiredVotes", void 0);
