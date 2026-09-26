"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const vitest_1 = require("vitest");
const users_service_1 = require("./users.service");
const user_entity_1 = require("./entities/user.entity");
const common_1 = require("@nestjs/common");
(0, vitest_1.describe)('UsersService (Soft Delete Hygiene)', () => {
    let service;
    let repo;
    const mockUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const mockRepo = {
        find: vitest_1.vi.fn(),
        findOne: vitest_1.vi.fn(),
        softDelete: vitest_1.vi.fn(),
        restore: vitest_1.vi.fn(),
        createQueryBuilder: vitest_1.vi.fn(() => ({
            where: vitest_1.vi.fn().mockReturnThis(),
            andWhere: vitest_1.vi.fn().mockReturnThis(),
            getOne: vitest_1.vi.fn().mockResolvedValue(mockUser),
        })),
    };
    (0, vitest_1.beforeEach)(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                users_service_1.UsersService,
                {
                    provide: (0, typeorm_1.getRepositoryToken)(user_entity_1.User),
                    useValue: mockRepo,
                },
            ],
        }).compile();
        service = module.get(users_service_1.UsersService);
        repo = module.get((0, typeorm_1.getRepositoryToken)(user_entity_1.User));
    });
    (0, vitest_1.it)('should soft-delete a user successfully', async () => {
        mockRepo.softDelete.mockResolvedValueOnce({ affected: 1 });
        await (0, vitest_1.expect)(service.softDeleteUser(mockUser.id)).resolves.not.toThrow();
        (0, vitest_1.expect)(mockRepo.softDelete).toHaveBeenCalledWith(mockUser.id);
    });
    (0, vitest_1.it)('should restore a soft-deleted user', async () => {
        const deletedUser = { ...mockUser, deletedAt: new Date() };
        mockRepo.findOne
            .mockResolvedValueOnce(deletedUser) // first call with withDeleted: true
            .mockResolvedValueOnce(mockUser); // second call inside findActiveById
        mockRepo.restore.mockResolvedValueOnce({ affected: 1 });
        const restored = await service.restoreUser(mockUser.id);
        (0, vitest_1.expect)(mockRepo.restore).toHaveBeenCalledWith(mockUser.id);
        (0, vitest_1.expect)(restored).toEqual(mockUser);
    });
    (0, vitest_1.it)('should throw NotFoundException if restoring non-existent user', async () => {
        mockRepo.findOne.mockResolvedValueOnce(null);
        await (0, vitest_1.expect)(service.restoreUser('invalid-id')).rejects.toThrow(common_1.NotFoundException);
    });
});
