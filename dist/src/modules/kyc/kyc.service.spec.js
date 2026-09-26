"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const vitest_1 = require("vitest");
const kyc_service_1 = require("./kyc.service");
const user_entity_1 = require("../users/entities/user.entity");
const kyc_audit_log_entity_1 = require("./entities/kyc-audit-log.entity");
const kyc_webhook_dto_1 = require("./dto/kyc-webhook.dto");
(0, vitest_1.describe)('KycService (Webhook Ingestion)', () => {
    let service;
    const mockUser = {
        id: 'user-uuid-123',
        kycStatus: kyc_webhook_dto_1.KycStatus.PENDING,
    };
    const mockQueryRunner = {
        manager: {
            findOne: vitest_1.vi.fn().mockResolvedValue(mockUser),
            save: vitest_1.vi.fn().mockImplementation((entity, obj) => Promise.resolve(obj)),
            create: vitest_1.vi.fn().mockImplementation((entity, obj) => obj),
        },
    };
    const mockDataSource = {
        transaction: vitest_1.vi.fn((cb) => cb(mockQueryRunner.manager)),
    };
    (0, vitest_1.beforeEach)(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                kyc_service_1.KycService,
                { provide: (0, typeorm_1.getRepositoryToken)(user_entity_1.User), useValue: {} },
                { provide: (0, typeorm_1.getRepositoryToken)(kyc_audit_log_entity_1.KycAuditLog), useValue: {} },
                { provide: typeorm_2.DataSource, useValue: mockDataSource },
            ],
        }).compile();
        service = module.get(kyc_service_1.KycService);
    });
    (0, vitest_1.it)('should process webhook, update user status, and save audit log', async () => {
        const dto = {
            userId: 'user-uuid-123',
            applicantId: 'app-456',
            status: kyc_webhook_dto_1.KycStatus.APPROVED,
            reason: 'Documents verified',
        };
        await service.processWebhook(dto);
        (0, vitest_1.expect)(mockDataSource.transaction).toHaveBeenCalled();
        (0, vitest_1.expect)(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(user_entity_1.User, {
            where: { id: dto.userId },
        });
        (0, vitest_1.expect)(mockQueryRunner.manager.save).toHaveBeenCalledTimes(2); // Saves user and audit log
    });
});
