"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vote = exports.VoteChoice = void 0;
const typeorm_1 = require("typeorm");
var VoteChoice;
(function (VoteChoice) {
    VoteChoice["YES"] = "yes";
    VoteChoice["NO"] = "no";
    VoteChoice["ABSTAIN"] = "abstain";
})(VoteChoice || (exports.VoteChoice = VoteChoice = {}));
let Vote = class Vote {
};
exports.Vote = Vote;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid')
], Vote.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'uuid' })
], Vote.prototype, "proposalId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'uuid' })
], Vote.prototype, "voterId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 10 })
], Vote.prototype, "choice", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 1 })
], Vote.prototype, "weight", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp' })
], Vote.prototype, "createdAt", void 0);
exports.Vote = Vote = __decorate([
    (0, typeorm_1.Entity)('votes'),
    (0, typeorm_1.Unique)(['proposalId', 'voterId'])
], Vote);
