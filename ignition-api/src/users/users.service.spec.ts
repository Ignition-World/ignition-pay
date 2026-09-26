import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import Keyv from 'keyv';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { UsersService } from './users.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('keyv', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    })),
  };
});

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

interface PasswordHistoryRecord {
  id: string;
  passwordHash: string;
}

interface PrismaMock {
  user: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  passwordHistory: {
    findMany: jest.Mock<Promise<PasswordHistoryRecord[]>, []>;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  emailVerificationToken: {
    create: jest.Mock;
  };
  $transaction: jest.Mock<
    Promise<unknown>,
    [(tx: PrismaMock) => Promise<unknown>]
  >;
}

const baseUser = {
  id: 'user-1',
  walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
  email: 'alex.river@example.com',
  displayName: 'Alex River',
  name: 'Alex River',
  passwordHash: null as string | null,
  role: 'USER',
  loginAttempts: 0,
  lockedUntil: null,
};

describe('UsersService password security', () => {
  let prisma: PrismaMock;
  let service: UsersService;
  let cache: Keyv;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      passwordHistory: {
        findMany: jest.fn<Promise<PasswordHistoryRecord[]>, []>(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      emailVerificationToken: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as Keyv;

    bcryptMock.compare.mockReset();
    bcryptMock.hash.mockReset();
    bcryptMock.hash.mockResolvedValue('hash:new-password' as never);

    service = new UsersService(
      prisma as unknown as PrismaService,
      { sign: jest.fn() } as unknown as JwtService,
      new ConfigService({ PASSWORD_BCRYPT_ROUNDS: '12' }),
      cache,
      { createSession: jest.fn() } as unknown as SessionService,
    );
  });

  it('sets a first password, stores history, and returns success', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.passwordHistory.findMany.mockResolvedValue([]);

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'ValidPassw0rd!',
      }),
    ).resolves.toEqual({ success: true, message: 'Password set successfully' });

    expect(bcryptMock.hash).toHaveBeenCalledWith('ValidPassw0rd!', 12);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { passwordHash: 'hash:new-password' },
    });
    expect(prisma.passwordHistory.create).toHaveBeenCalledWith({
      data: {
        userId: baseUser.id,
        passwordHash: 'hash:new-password',
      },
    });
  });

  it('rejects setup when a password already exists', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:existing',
    });

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'ValidPassw0rd!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects weak setup passwords before hashing', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'weak',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('changes password when current password is valid', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:current',
    });
    prisma.passwordHistory.findMany.mockResolvedValue([
      { id: 'history-1', passwordHash: 'hash:current' },
    ]);
    bcryptMock.compare.mockResolvedValueOnce(true as never);
    bcryptMock.compare.mockResolvedValueOnce(false as never);

    await expect(
      service.changePassword({
        userId: baseUser.id,
        currentPassword: 'CurrentPassw0rd!',
        newPassword: 'FreshSecure2026!',
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Password changed successfully',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { passwordHash: 'hash:new-password' },
    });
  });

  it('rejects change when current password is invalid', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:current',
    });
    bcryptMock.compare.mockResolvedValueOnce(false as never);

    await expect(
      service.changePassword({
        userId: baseUser.id,
        currentPassword: 'WrongPassw0rd!',
        newPassword: 'FreshSecure2026!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('rejects reuse of any of the last five passwords', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: 'hash:current',
    });
    prisma.passwordHistory.findMany.mockResolvedValue([
      { id: 'history-1', passwordHash: 'hash:old-1' },
      { id: 'history-2', passwordHash: 'hash:old-2' },
    ]);
    bcryptMock.compare
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never);

    await expect(
      service.changePassword({
        userId: baseUser.id,
        currentPassword: 'CurrentPassw0rd!',
        newPassword: 'ReuseSecure2026!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('prunes password history to the five newest records', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.passwordHistory.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'delete-1', passwordHash: 'hash:6' }]);

    await service.setupPassword({
      userId: baseUser.id,
      password: 'ValidPassw0rd!',
    });

    expect(prisma.passwordHistory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['delete-1'] },
      },
    });
  });

  it('rejects setup when the new password matches a recent history entry', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.passwordHistory.findMany.mockResolvedValue([
      { id: 'history-1', passwordHash: 'hash:old-1' },
      { id: 'history-2', passwordHash: 'hash:old-2' },
    ]);
    bcryptMock.compare
      .mockResolvedValueOnce(false as never)
      .mockResolvedValueOnce(true as never);

    await expect(
      service.setupPassword({
        userId: baseUser.id,
        password: 'ReuseOldPassw0rd!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
  });

  it('creates password history entry during registration', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'new-user-1' } as any);
    prisma.passwordHistory.create.mockResolvedValue({} as any);
    prisma.emailVerificationToken.create.mockResolvedValue({} as any);

    const result = await service.register(
      'newuser@example.com',
      'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      'ValidPassw0rd!',
    );

    expect(prisma.passwordHistory.create).toHaveBeenCalledWith({
      data: {
        userId: 'new-user-1',
        passwordHash: 'hash:new-password',
      },
    });
    expect(result).toEqual({
      message: 'Registration successful. Please confirm your email.',
    });
  });
});

describe('UsersService login', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      auditLogs?: { create?: jest.Mock };
    };
    auditLog?: { create: jest.Mock };
  };
  let cache: { set: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        auditLogs: { create: jest.fn() },
      },
      auditLog: { create: jest.fn() },
    };
    cache = {
      set: jest.fn(),
    };

    service = new UsersService(
      prisma as unknown as PrismaService,
      {
        sign: jest.fn().mockReturnValue('signed-jwt-token'),
      } as unknown as JwtService,
      new ConfigService({
        JWT_SECRET: 'test-secret',
        REFRESH_TOKEN_SECRET: 'test-refresh-secret',
        LOGIN_MAX_ATTEMPTS: '5',
        LOGIN_LOCKOUT_SECONDS: '900',
      }),
      cache as unknown as Keyv,
      {
        createSession: jest
          .fn()
          .mockResolvedValue({ sessionId: 'test-session' }),
      } as any,
    );
  });

  const mkUser = (overrides: Partial<{
    id: string;
    walletAddress: string;
    email: string;
    passwordHash: string | null;
    role: string;
    loginAttempts: number;
    lockedUntil: Date | null;
  }> = {}) => ({
    id: 'user-123',
    walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: 'USER',
    loginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  });

  it('stores refresh token in Redis on successful login', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(mkUser());
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    bcryptMock.compare.mockResolvedValueOnce(true as never);

    await service.login('test@example.com', 'password123');

    expect(cache.set).toHaveBeenCalledWith(
      `refresh:${mkUser().walletAddress}`,
      expect.any(String),
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it('resets loginAttempts and lockedUntil on successful login (Issue #232)', async () => {
    const user = mkUser({ loginAttempts: 3, lockedUntil: new Date(Date.now() - 1) });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    bcryptMock.compare.mockResolvedValueOnce(true as never);

    await service.login(user.email, 'good-password');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });
  });

  it('increments loginAttempts on failed password but does not lock yet (Issue #232)', async () => {
    const user = mkUser({ loginAttempts: 2 });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    bcryptMock.compare.mockResolvedValueOnce(false as never);

    await expect(service.login(user.email, 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { loginAttempts: 3, lockedUntil: null },
    });
  });

  it('sets lockedUntil when loginAttempts reaches the threshold (Issue #232)', async () => {
    const user = mkUser({ loginAttempts: 4 }); // next failure => 5 >= LOGIN_MAX_ATTEMPTS
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    bcryptMock.compare.mockResolvedValueOnce(false as never);

    const before = Date.now();
    await expect(service.login(user.email, 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: user.id });
    expect(updateCall.data.loginAttempts).toBe(5);
    expect(updateCall.data.lockedUntil).toBeInstanceOf(Date);
    const lockedUntil = updateCall.data.lockedUntil as Date;
    // Should be roughly LOGIN_LOCKOUT_SECONDS in the future (allow small drift).
    expect(lockedUntil.getTime() - before).toBeGreaterThanOrEqual(890_000);
    expect(lockedUntil.getTime() - before).toBeLessThanOrEqual(910_000);
  });

  it('rejects login while account is locked and surfaces retryAfterSeconds (Issue #232/#229)', async () => {
    const retryAfter = 120;
    const user = mkUser({
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() + retryAfter * 1000),
    });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);

    try {
      await service.login(user.email, 'any-password');
      fail('Expected login() to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const response = (err as UnauthorizedException).getResponse() as {
        message: string;
        retryAfterSeconds?: number;
      };
      expect(response.message).toMatch(/Account locked/);
      expect(response.retryAfterSeconds).toBeGreaterThanOrEqual(retryAfter - 5);
      expect(response.retryAfterSeconds).toBeLessThanOrEqual(retryAfter);
    }
  });

  it('does not lock accounts with no passwordHash (Issue #232)', async () => {
    const user = mkUser({ passwordHash: null });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);

    await expect(service.login(user.email, 'any')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('UsersService unlockUser (Issue #232)', () => {
  let prisma: {
    user: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let cache: Keyv;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as Keyv;

    service = new UsersService(
      prisma as unknown as PrismaService,
      { sign: jest.fn() } as unknown as JwtService,
      new ConfigService({}),
      cache,
    );
  });

  /**
   * Helper: match the admin lookup's OR-shaped where clause used by
   * `verifyAdminRole`. Without this, the mock returns null and the
   * test accidentally exercises verifyAdminRole's failure path
   * instead of the unlock code under test.
   *
   * `targetById` is an optional record keyed by `args.where.id` so we
   * can also return different values for the target-user lookup.
   */
  const mockReturnsAdminAndTargets = (
    callerId: string,
    adminRecord: unknown,
    targetById: Record<string, unknown> = {},
  ) =>
    jest.fn().mockImplementation((args: any) => {
      const orClauses = args?.where?.OR ?? [];
      const matchesAdminLookup = orClauses.some(
        (clause: { id?: string; walletAddress?: string }) =>
          clause?.id === callerId || clause?.walletAddress === callerId,
      );
      if (matchesAdminLookup) {
        return adminRecord;
      }
      const targetId = args?.where?.id;
      if (targetId && Object.prototype.hasOwnProperty.call(targetById, targetId)) {
        return targetById[targetId];
      }
      return null;
    });

  it('unlocks a locked user and writes an audit log', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' };
    const target = {
      id: 'user-locked',
      deletedAt: null,
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    };
    (prisma.user.findFirst as jest.Mock) = mockReturnsAdminAndTargets(
      'admin-1',
      admin,
      { 'user-locked': target },
    );

    const result = await service.unlockUser('user-locked', 'admin-1');

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/unlocked/i);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-locked' },
      data: { loginAttempts: 0, lockedUntil: null },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        action: 'ADMIN_ACTION',
        resourceType: 'User',
        resourceId: 'user-locked',
        details: expect.stringContaining('ACCOUNT_UNLOCK'),
      }),
    });
  });

  it('returns success without writing when account is not locked', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' };
    const target = {
      id: 'user-clean',
      deletedAt: null,
      loginAttempts: 0,
      lockedUntil: null,
    };
    (prisma.user.findFirst as jest.Mock) = mockReturnsAdminAndTargets(
      'admin-1',
      admin,
      { 'user-clean': target },
    );

    const result = await service.unlockUser('user-clean', 'admin-1');

    expect(result.message).toMatch(/not locked/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when target user does not exist', async () => {
    const admin = { id: 'admin-1', role: 'ADMIN' };
    (prisma.user.findFirst as jest.Mock) = mockReturnsAdminAndTargets(
      'admin-1',
      admin,
    );

    await expect(service.unlockUser('missing-user', 'admin-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when caller is not an admin', async () => {
    const nonAdmin = { id: 'user-2', role: 'USER' };
    (prisma.user.findFirst as jest.Mock) = mockReturnsAdminAndTargets(
      'user-2',
      nonAdmin,
    );

    await expect(service.unlockUser('any-id', 'user-2')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('UsersService profile calculations', () => {
  let prisma: {
    user: {
      findFirst: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let cache: Keyv;
  let service: UsersService;

  const baseDate = new Date('2025-01-01T00:00:00Z');

  const baseProfileUser = () => ({
    id: 'profile-user-1',
    walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
    email: 'profile@example.com',
    displayName: 'Profile User',
    name: 'Profile User',
    phone: '+1234567890',
    bio: 'A test profile user',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'USER' as const,
    kycStatus: 'VERIFIED' as const,
    emailVerifiedAt: baseDate,
    createdAt: baseDate,
    updatedAt: baseDate,
    deletedAt: null as Date | null,
    isActive: true,
    loginAttempts: 0,
    lockedUntil: null,
    verifiedStatus: true,
    passwordHash: null,
    preferences: null,
    socialLinks: null,
  });

  const mockUserWithRelations = (overrides?: {
    campaigns?: Array<{ raisedAmount: number; status: string }>;
    donations?: Array<{ amount: number }>;
  }) => {
    const campaignsData = overrides?.campaigns ?? [];
    return {
      ...baseProfileUser(),
      campaigns: campaignsData.map((c, i) => ({
        id: `campaign-${i}`,
        title: `Test Campaign ${i}`,
        description: `A test campaign ${i}`,
        goalAmount: 1000,
        raisedAmount: c.raisedAmount,
        status: c.status,
        creatorId: 'profile-user-1',
        startDate: null,
        endDate: null,
        imageUrl: null,
        category: null,
        createdAt: baseDate,
        updatedAt: baseDate,
      })),
      donations: (overrides?.donations ?? []).map((d, i) => ({
        id: `donation-${i}`,
        amount: d.amount,
        assetCode: 'XLM',
        txHash: null,
        status: 'COMPLETED' as const,
        donorId: 'profile-user-1',
        campaignId: 'campaign-0',
        donatedAt: baseDate,
        confirmedAt: baseDate,
        createdAt: baseDate,
        updatedAt: baseDate,
      })),
    };
  };

  // Helper: apply include filter as Prisma would (cascades into nested relation where clauses)
  function applyIncludeFilter(
    user: ReturnType<typeof mockUserWithRelations>,
    include: any,
  ) {
    if (!include) return user;
    const result = { ...user };
    if (include.campaigns?.where?.status) {
      result.campaigns = result.campaigns.filter(
        (c: any) => c.status === include.campaigns.where.status,
      );
    }
    return result;
  }

  // Set up findFirst to respect include filters + provide base data
  function mockFindFirstData(data: ReturnType<typeof mockUserWithRelations>) {
    prisma.user.findFirst.mockImplementation((args: any) => {
      if (!args) return null;
      if (
        args?.where?.deletedAt === null &&
        args?.where?.walletAddress === 'UNKNOWN_WALLET'
      ) {
        return null;
      }
      return applyIncludeFilter(data, args?.include);
    });
  }

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation((args: any) => {
          return {
            ...mockUserWithRelations({ campaigns: [], donations: [] }),
            ...args.data,
            campaigns: mockUserWithRelations({ campaigns: [], donations: [] })
              .campaigns,
            donations: mockUserWithRelations({ campaigns: [], donations: [] })
              .donations,
          };
        }),
        findUnique: jest.fn(),
      },
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as Keyv;

    service = new UsersService(
      prisma as unknown as PrismaService,
      { sign: jest.fn() } as unknown as JwtService,
      new ConfigService({}),
      cache,
    );
  });

  describe('getMyProfile', () => {
    it('returns full profile with aggregated stats from related campaigns and donations', async () => {
      mockFindFirstData(
        mockUserWithRelations({
          campaigns: [
            { raisedAmount: 500, status: 'ACTIVE' },
            { raisedAmount: 300, status: 'ACTIVE' },
          ],
          donations: [{ amount: 100 }, { amount: 50 }, { amount: 25 }],
        }),
      );

      const result = await service.getMyProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.totalRaised).toBe(800);
      expect(result.totalDonated).toBe(175);
      expect(result.campaignCount).toBe(2);
      expect(result.id).toBe('profile-user-1');
      expect(result.email).toBe('profile@example.com');
      expect(result.displayName).toBe('Profile User');
      expect(result.name).toBe('Profile User');
      expect(result.phone).toBe('+1234567890');
      expect(result.bio).toBe('A test profile user');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.role).toBe('USER');
      expect(result.kycStatus).toBe('VERIFIED');
      expect(result.emailVerifiedAt).toEqual(baseDate);
      expect(result.createdAt).toEqual(baseDate);
      expect(result.updatedAt).toEqual(baseDate);
      expect(result.deletedAt).toBeUndefined();
    });

    it('only counts ACTIVE campaigns and excludes DRAFT or COMPLETED', async () => {
      mockFindFirstData(
        mockUserWithRelations({
          campaigns: [
            { raisedAmount: 1000, status: 'ACTIVE' },
            { raisedAmount: 500, status: 'DRAFT' },
            { raisedAmount: 200, status: 'COMPLETED' },
          ],
          donations: [],
        }),
      );

      const result = await service.getMyProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.campaignCount).toBe(1);
      expect(result.totalRaised).toBe(1000);
    });

    it('returns zero stats when user has no campaigns or donations', async () => {
      mockFindFirstData(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      const result = await service.getMyProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.totalRaised).toBe(0);
      expect(result.totalDonated).toBe(0);
      expect(result.campaignCount).toBe(0);
    });

    it('returns zero stats when user has no active campaigns but has non-active ones', async () => {
      mockFindFirstData(
        mockUserWithRelations({
          campaigns: [
            { raisedAmount: 500, status: 'DRAFT' },
            { raisedAmount: 300, status: 'COMPLETED' },
          ],
          donations: [],
        }),
      );

      const result = await service.getMyProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.campaignCount).toBe(0);
      expect(result.totalRaised).toBe(0);
    });

    it('throws NotFoundException when user is not found', async () => {
      mockFindFirstData(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await expect(service.getMyProfile('UNKNOWN_WALLET')).rejects.toThrow(
        'User not found',
      );
    });

    it('queries with walletAddress and deletedAt:null filter', async () => {
      mockFindFirstData(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await service.getMyProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
          deletedAt: null,
        },
        include: {
          campaigns: { where: { status: 'ACTIVE' } },
          donations: true,
        },
      });
    });

    it('handles undefined optional fields', async () => {
      const userData = mockUserWithRelations({ campaigns: [], donations: [] });
      userData.displayName = null;
      userData.name = null;
      userData.phone = null;
      userData.bio = null;
      userData.avatarUrl = null;
      userData.emailVerifiedAt = null;
      userData.deletedAt = null;
      mockFindFirstData(userData);

      const result = await service.getMyProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.displayName).toBeUndefined();
      expect(result.name).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.bio).toBeUndefined();
      expect(result.avatarUrl).toBeUndefined();
      expect(result.emailVerifiedAt).toBeUndefined();
      expect(result.deletedAt).toBeUndefined();
    });
  });

  describe('updateMyProfile', () => {
    it('updates allowed fields and returns profile with recalculated stats', async () => {
      const existingUser = mockUserWithRelations({
        campaigns: [{ raisedAmount: 750, status: 'ACTIVE' }],
        donations: [{ amount: 200 }],
      });
      existingUser.displayName = 'Original Name';
      existingUser.bio = 'Original bio';

      const updatedUser = {
        ...existingUser,
        displayName: 'Updated Name',
        bio: 'Updated bio',
      };

      prisma.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateMyProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
        {
          displayName: 'Updated Name',
          bio: 'Updated bio',
        },
      );

      expect(result.displayName).toBe('Updated Name');
      expect(result.bio).toBe('Updated bio');
      expect(result.totalRaised).toBe(750);
      expect(result.totalDonated).toBe(200);
      expect(result.campaignCount).toBe(1);
    });

    it('throws NotFoundException when user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateMyProfile('UNKNOWN_WALLET', { displayName: 'Test' }),
      ).rejects.toThrow('User not found');
    });

    it('throws BadRequestException when new email is already taken', async () => {
      const existingUser = mockUserWithRelations({
        campaigns: [],
        donations: [],
      });
      existingUser.email = 'current@example.com';
      prisma.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'other-user',
        email: 'taken@example.com',
      });

      await expect(
        service.updateMyProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF', {
          email: 'taken@example.com',
        }),
      ).rejects.toThrow('Email already in use');
    });

    it('throws BadRequestException when preferences JSON is invalid', async () => {
      prisma.user.findFirst.mockResolvedValue(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await expect(
        service.updateMyProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF', {
          preferences: 'not-valid-json',
        }),
      ).rejects.toThrow('Invalid preferences JSON');
    });

    it('throws BadRequestException when socialLinks JSON is invalid', async () => {
      prisma.user.findFirst.mockResolvedValue(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await expect(
        service.updateMyProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF', {
          socialLinks: 'not-valid-json',
        }),
      ).rejects.toThrow('Invalid socialLinks JSON');
    });

    it('does not check email uniqueness when email is unchanged', async () => {
      const existingUser = mockUserWithRelations({
        campaigns: [],
        donations: [],
      });
      existingUser.email = 'same@example.com';

      prisma.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await service.updateMyProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF', {
        email: 'same@example.com',
      });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('updates only provided fields preserving existing values', async () => {
      const existingUser = mockUserWithRelations({
        campaigns: [],
        donations: [],
      });
      existingUser.displayName = 'Original Name';
      existingUser.name = 'Original Name';

      prisma.user.findFirst
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue({
        ...existingUser,
        name: 'New Name',
        campaigns: [],
        donations: [],
      });

      await service.updateMyProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF', {
        name: 'New Name',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Name',
            displayName: 'Original Name',
          }),
        }),
      );
    });
  });

  describe('getPublicProfile', () => {
    it('returns public profile with campaign stats', async () => {
      mockFindFirstData(
        mockUserWithRelations({
          campaigns: [
            { raisedAmount: 1000, status: 'ACTIVE' },
            { raisedAmount: 2000, status: 'ACTIVE' },
          ],
          donations: [],
        }),
      );

      const result = await service.getPublicProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.displayName).toBe('Profile User');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.bio).toBe('A test profile user');
      expect(result.verifiedStatus).toBe(true);
      expect(result.campaignCount).toBe(2);
      expect(result.totalRaised).toBe(3000);
    });

    it('only counts ACTIVE campaigns for public stats', async () => {
      mockFindFirstData(
        mockUserWithRelations({
          campaigns: [
            { raisedAmount: 5000, status: 'ACTIVE' },
            { raisedAmount: 500, status: 'DRAFT' },
          ],
          donations: [],
        }),
      );

      const result = await service.getPublicProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.campaignCount).toBe(1);
      expect(result.totalRaised).toBe(5000);
    });

    it('maps kycStatus VERIFIED to verifiedStatus true', async () => {
      mockFindFirstData(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      const result = await service.getPublicProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );
      expect(result.verifiedStatus).toBe(true);
    });

    it('maps kycStatus UNVERIFIED to verifiedStatus false', async () => {
      const userData = mockUserWithRelations({ campaigns: [], donations: [] });
      userData.kycStatus = 'UNVERIFIED';
      mockFindFirstData(userData);

      const result = await service.getPublicProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );
      expect(result.verifiedStatus).toBe(false);
    });

    it('returns undefined optional fields when not set', async () => {
      const userData = mockUserWithRelations({ campaigns: [], donations: [] });
      userData.displayName = null;
      userData.avatarUrl = null;
      userData.bio = null;
      mockFindFirstData(userData);

      const result = await service.getPublicProfile(
        'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
      );

      expect(result.displayName).toBeUndefined();
      expect(result.avatarUrl).toBeUndefined();
      expect(result.bio).toBeUndefined();
    });

    it('throws NotFoundException when user is not found', async () => {
      mockFindFirstData(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await expect(service.getPublicProfile('UNKNOWN_WALLET')).rejects.toThrow(
        'not found',
      );
    });

    it('queries with campaigns include filtered to ACTIVE only', async () => {
      mockFindFirstData(
        mockUserWithRelations({ campaigns: [], donations: [] }),
      );

      await service.getPublicProfile('GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          walletAddress: 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF',
          deletedAt: null,
        },
        include: {
          campaigns: { where: { status: 'ACTIVE' } },
        },
      });
    });
  });
});
