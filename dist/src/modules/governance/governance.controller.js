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
exports.GovernanceController = void 0;
const common_1 = require("@nestjs/common");
let GovernanceController = class GovernanceController {
    constructor(governanceService) {
        this.governanceService = governanceService;
    }
    async createProposal(dto) {
        return this.governanceService.createProposal(dto);
    }
    async listProposals(status) {
        return this.governanceService.listProposals(status);
    }
    async getProposal(id) {
        return this.governanceService.getProposal(id);
    }
    async activateProposal(id) {
        return this.governanceService.activateProposal(id);
    }
    async castVote(id, dto) {
        return this.governanceService.castVote(id, dto);
    }
    async tallyAndClose(id) {
        return this.governanceService.tallyAndClose(id);
    }
    async executeProposal(id) {
        return this.governanceService.executeProposal(id);
    }
    async getResults(id) {
        return this.governanceService.getResults(id);
    }
};
exports.GovernanceController = GovernanceController;
__decorate([
    (0, common_1.Post)('proposals'),
    __param(0, (0, common_1.Body)())
], GovernanceController.prototype, "createProposal", null);
__decorate([
    (0, common_1.Get)('proposals'),
    __param(0, (0, common_1.Query)('status'))
], GovernanceController.prototype, "listProposals", null);
__decorate([
    (0, common_1.Get)('proposals/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe))
], GovernanceController.prototype, "getProposal", null);
__decorate([
    (0, common_1.Post)('proposals/:id/activate'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe))
], GovernanceController.prototype, "activateProposal", null);
__decorate([
    (0, common_1.Post)('proposals/:id/votes'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)())
], GovernanceController.prototype, "castVote", null);
__decorate([
    (0, common_1.Post)('proposals/:id/tally'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe))
], GovernanceController.prototype, "tallyAndClose", null);
__decorate([
    (0, common_1.Post)('proposals/:id/execute'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe))
], GovernanceController.prototype, "executeProposal", null);
__decorate([
    (0, common_1.Get)('proposals/:id/results'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe))
], GovernanceController.prototype, "getResults", null);
exports.GovernanceController = GovernanceController = __decorate([
    (0, common_1.Controller)('governance')
], GovernanceController);
