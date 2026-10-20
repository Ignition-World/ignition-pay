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
var EmailVerificationCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailVerificationCleanupService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const typeorm_1 = require("@nestjs/typeorm"); // Or Prisma / TypeORM / Drizzle depending on ORM
const email_verification_token_entity_1 = require("../entities/email-verification-token.entity");
let EmailVerificationCleanupService = EmailVerificationCleanupService_1 = class EmailVerificationCleanupService {
    constructor(tokenRepository) {
        this.tokenRepository = tokenRepository;
        this.logger = new common_1.Logger(EmailVerificationCleanupService_1.name);
    }
    /**
     * Cron job running daily at midnight to prune expired or used verification tokens.
     */
    async handleCron() {
        this.logger.log('Starting email verification token cleanup job...');
        const now = new Date();
        try {
            // Deletes tokens that either have a usedAt date OR whose expiresAt timestamp is in the past
            const result = await this.tokenRepository
                .createQueryBuilder()
                .delete()
                .from(email_verification_token_entity_1.EmailVerificationToken)
                .where('usedAt IS NOT NULL')
                .orWhere('expiresAt < :now', { now })
                .execute();
            const deletedCount = result.affected ?? 0;
            this.logger.log(`Successfully pruned ${deletedCount} expired/used email verification tokens.`);
            return deletedCount;
        }
        catch (error) {
            this.logger.error('Failed to cleanup email verification tokens', error);
            throw error;
        }
    }
};
exports.EmailVerificationCleanupService = EmailVerificationCleanupService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT)
], EmailVerificationCleanupService.prototype, "handleCron", null);
exports.EmailVerificationCleanupService = EmailVerificationCleanupService = EmailVerificationCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(email_verification_token_entity_1.EmailVerificationToken))
], EmailVerificationCleanupService);
