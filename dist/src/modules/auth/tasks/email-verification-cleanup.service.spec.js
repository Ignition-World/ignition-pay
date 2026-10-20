"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const vitest_1 = require("vitest");
const email_verification_cleanup_service_1 = require("./email-verification-cleanup.service");
const email_verification_token_entity_1 = require("../entities/email-verification-token.entity");
(0, vitest_1.describe)('EmailVerificationCleanupService', () => {
    let service;
    let repository;
    const mockQueryBuilder = {
        delete: vitest_1.vi.fn().mockReturnThis(),
        from: vitest_1.vi.fn().mockReturnThis(),
        where: vitest_1.vi.fn().mockReturnThis(),
        orWhere: vitest_1.vi.fn().mockReturnThis(),
        execute: vitest_1.vi.fn().mockResolvedValue({ affected: 5 }),
    };
    (0, vitest_1.beforeEach)(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                email_verification_cleanup_service_1.EmailVerificationCleanupService,
                {
                    provide: (0, typeorm_1.getRepositoryToken)(email_verification_token_entity_1.EmailVerificationToken),
                    useValue: {
                        createQueryBuilder: vitest_1.vi.fn(() => mockQueryBuilder),
                    },
                },
            ],
        }).compile();
        service = module.get(email_verification_cleanup_service_1.EmailVerificationCleanupService);
        repository = module.get((0, typeorm_1.getRepositoryToken)(email_verification_token_entity_1.EmailVerificationToken));
    });
    (0, vitest_1.it)('should be defined', () => {
        (0, vitest_1.expect)(service).toBeDefined();
    });
    (0, vitest_1.it)('should prune used or expired tokens successfully', async () => {
        const deletedCount = await service.handleCron();
        (0, vitest_1.expect)(repository.createQueryBuilder).toHaveBeenCalled();
        (0, vitest_1.expect)(mockQueryBuilder.execute).toHaveBeenCalled();
        (0, vitest_1.expect)(deletedCount).toBe(5);
    });
});
