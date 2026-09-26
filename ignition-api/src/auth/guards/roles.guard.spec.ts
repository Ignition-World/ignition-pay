import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let prisma: { user: { findFirst: jest.Mock } };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    prisma = {
      user: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true if no roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const context = {
      getHandler: () => {},
      getClass: () => {},
    } as unknown as ExecutionContext;

    const res = await guard.canActivate(context);
    expect(res).toBe(true);
  });

  it('should throw ForbiddenException if user is not on request', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('User not authenticated'),
    );
  });

  it('should throw ForbiddenException if db user is not found', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'u-123' } }),
      }),
    } as unknown as ExecutionContext;

    prisma.user.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('User not found'),
    );
  });

  it('should find user by walletAddress if sub is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { walletAddress: 'G123' } }),
      }),
    } as unknown as ExecutionContext;

    prisma.user.findFirst.mockResolvedValue({
      id: 'u-123',
      role: UserRole.USER,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Forbidden resource: insufficient permissions'),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { walletAddress: 'G123', deletedAt: null },
    });
  });

  it('should return true if user has required role', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = {
      getHandler: () => {},
      getClass: () => {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'u-123' } }),
      }),
    } as unknown as ExecutionContext;

    prisma.user.findFirst.mockResolvedValue({
      id: 'u-123',
      role: UserRole.ADMIN,
    });

    const res = await guard.canActivate(context);
    expect(res).toBe(true);
  });
});
