"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CastVoteDto = void 0;
const class_validator_1 = require("class-validator");
const vote_entity_1 = require("../entities/vote.entity");
class CastVoteDto {
}
exports.CastVoteDto = CastVoteDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsNotEmpty)()
], CastVoteDto.prototype, "voterId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(vote_entity_1.VoteChoice)
], CastVoteDto.prototype, "choice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1)
], CastVoteDto.prototype, "weight", void 0);
