import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { KycService } from './kyc.service';
import { User } from '../users/entities/user.entity';
import { KycAuditLog } from './entities/kyc-audit-log.entity';
import { KycStatus, KycWebhookDto } from './dto/kyc-webhook.dto';

describe('KycService (Webhook Ingestion)', () => {
  let service: KycService;

  const mockUser = {
    id: 'user-uuid-123',
    kycStatus: KycStatus.PENDING,
  };

  const mockQueryRunner = {
    manager: {
      findOne: vi.fn().mockResolvedValue(mockUser),
      save: vi.fn().mockImplementation((entity, obj) => Promise.resolve(obj)),
      create: vi.fn().mockImplementation((entity, obj) => obj),
    },
  };

  const mockDataSource = {
    transaction: vi.fn((cb) => cb(mockQueryRunner.manager)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(KycAuditLog), useValue: {} },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  it('should process webhook, update user status, and save audit log', async () => {
    const dto: KycWebhookDto = {
      userId: 'user-uuid-123',
      applicantId: 'app-456',
      status: KycStatus.APPROVED,
      reason: 'Documents verified',
    };

    await service.processWebhook(dto);

    expect(mockDataSource.transaction).toHaveBeenCalled();
    expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(User, {
      where: { id: dto.userId },
    });
    expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(2); // Saves user and audit log
  });
});