import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { NotFoundException } from '@nestjs/common';

describe('UsersService (Soft Delete Hygiene)', () => {
  let service: UsersService;
  let repo: Repository<User>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'user@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepo = {
    find: vi.fn(),
    findOne: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    createQueryBuilder: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(mockUser),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should soft-delete a user successfully', async () => {
    mockRepo.softDelete.mockResolvedValueOnce({ affected: 1 });
    await expect(service.softDeleteUser(mockUser.id)).resolves.not.toThrow();
    expect(mockRepo.softDelete).toHaveBeenCalledWith(mockUser.id);
  });

  it('should restore a soft-deleted user', async () => {
    const deletedUser = { ...mockUser, deletedAt: new Date() };
    mockRepo.findOne
      .mockResolvedValueOnce(deletedUser) // first call with withDeleted: true
      .mockResolvedValueOnce(mockUser); // second call inside findActiveById

    mockRepo.restore.mockResolvedValueOnce({ affected: 1 });

    const restored = await service.restoreUser(mockUser.id);
    expect(mockRepo.restore).toHaveBeenCalledWith(mockUser.id);
    expect(restored).toEqual(mockUser);
  });

  it('should throw NotFoundException if restoring non-existent user', async () => {
    mockRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.restoreUser('invalid-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});