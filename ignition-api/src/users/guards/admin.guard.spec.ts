import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let prisma: { user: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminGuard, { provide: PrismaService, useValue: prisma }],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw ForbiddenException if user or walletAddress is missing', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('User not authenticated'),
    );
  });

  it('should throw ForbiddenException if user is not in database', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { walletAddress: 'G123' } }),
      }),
    } as unknown as ExecutionContext;

    prisma.user.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Admin access required'),
    );
  });

  it('should throw ForbiddenException if user is not an admin', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { walletAddress: 'G123' } }),
      }),
    } as unknown as ExecutionContext;

    prisma.user.findFirst.mockResolvedValue({ id: 'u-1', role: 'USER' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Admin access required'),
    );
  });

  it('should return true if user is admin', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { walletAddress: 'G123' } }),
      }),
    } as unknown as ExecutionContext;

    prisma.user.findFirst.mockResolvedValue({ id: 'u-1', role: 'ADMIN' });

    const res = await guard.canActivate(context);
    expect(res).toBe(true);
  });
});
