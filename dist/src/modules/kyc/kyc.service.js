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
var KycService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KycService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../users/entities/user.entity");
const kyc_audit_log_entity_1 = require("./entities/kyc-audit-log.entity");
let KycService = KycService_1 = class KycService {
    constructor(userRepository, auditLogRepository, dataSource) {
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(KycService_1.name);
    }
    /**
     * Processes verified KYC webhook: updates user status and records audit log in a transaction
     */
    async processWebhook(payload) {
        const { userId, applicantId, status, reason, metadata } = payload;
        await this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(user_entity_1.User, { where: { id: userId } });
            if (!user) {
                throw new common_1.NotFoundException(`User with ID ${userId} not found`);
            }
            const previousStatus = user.kycStatus;
            // Update User KYC Status
            user.kycStatus = status;
            await manager.save(user_entity_1.User, user);
            // Create Audit Log Entry
            const auditLog = manager.create(kyc_audit_log_entity_1.KycAuditLog, {
                userId,
                applicantId,
                previousStatus,
                newStatus: status,
                reason: reason ?? null,
                metadata: metadata ?? null,
            });
            await manager.save(kyc_audit_log_entity_1.KycAuditLog, auditLog);
            this.logger.log(`KYC status for user ${userId} updated from ${previousStatus} to ${status}`);
        });
    }
};
exports.KycService = KycService;
exports.KycService = KycService = KycService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(kyc_audit_log_entity_1.KycAuditLog))
], KycService);
