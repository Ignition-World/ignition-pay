"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const schedule_1 = require("@nestjs/schedule");
const user_entity_1 = require("../users/entities/user.entity");
const proposal_entity_1 = require("./entities/proposal.entity");
const vote_entity_1 = require("./entities/vote.entity");
const governance_service_1 = require("./governance.service");
const governance_controller_1 = require("./governance.controller");
const proposal_lifecycle_service_1 = require("./tasks/proposal-lifecycle.service");
let GovernanceModule = class GovernanceModule {
};
exports.GovernanceModule = GovernanceModule;
exports.GovernanceModule = GovernanceModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            typeorm_1.TypeOrmModule.forFeature([proposal_entity_1.Proposal, vote_entity_1.Vote, user_entity_1.User]),
        ],
        controllers: [governance_controller_1.GovernanceController],
        providers: [governance_service_1.GovernanceService, proposal_lifecycle_service_1.ProposalLifecycleService],
        exports: [governance_service_1.GovernanceService],
    })
], GovernanceModule);
