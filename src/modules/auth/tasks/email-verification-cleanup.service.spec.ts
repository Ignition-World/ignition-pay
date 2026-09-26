import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { EmailVerificationCleanupService } from './email-verification-cleanup.service';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';

describe('EmailVerificationCleanupService', () => {
  let service: EmailVerificationCleanupService;
  let repository: Repository<EmailVerificationToken>;

  const mockQueryBuilder = {
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 5 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationCleanupService,
        {
          provide: getRepositoryToken(EmailVerificationToken),
          useValue: {
            createQueryBuilder: vi.fn(() => mockQueryBuilder),
          },
        },
      ],
    }).compile();

    service = module.get<EmailVerificationCleanupService>(
      EmailVerificationCleanupService,
    );
    repository = module.get<Repository<EmailVerificationToken>>(
      getRepositoryToken(EmailVerificationToken),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should prune used or expired tokens successfully', async () => {
    const deletedCount = await service.handleCron();

    expect(repository.createQueryBuilder).toHaveBeenCalled();
    expect(mockQueryBuilder.execute).toHaveBeenCalled();
    expect(deletedCount).toBe(5);
  });
});