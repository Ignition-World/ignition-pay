import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { Inject } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import Keyv from 'keyv';
import { LoginResponseDto } from './dto/login.dto';
import { PasswordActionResponseDto } from './dto/password.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { SessionService } from '../session/session.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfileDto, PublicUserProfileDto } from './dto/user-profile.dto';
import { UserDashboardDto } from './dto/dashboard.dto';
import { DashboardCacheService } from './dashboard-cache.service';
import { assertStrongPassword } from './password-policy';

interface PasswordSetupInput {
  userId?: string;
  walletAddress?: string;
  password: string;
}

interface PasswordChangeInput {
  userId?: string;
  walletAddress?: string;
  currentPassword: string;
  newPassword: string;
}

interface PasswordUser {
  id: string;
  walletAddress: string | null;
  email: string | null;
  displayName: string | null;
  name: string | null;
  passwordHash: string | null;
}

const PASSWORD_HISTORY_LIMIT = 5;
const userProfileInclude = {
  campaigns: {
    where: { status: 'ACTIVE' },
  },
  donations: true,
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
    private readonly sessionService: SessionService,
    private readonly dashboardCache: DashboardCacheService,
  ) {}

  /**
   * Get authenticated user's full profile
   */
  async getMyProfile(walletAddress: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { walletAddress, deletedAt: null },
      include: userProfileInclude,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const totalRaised = user.campaigns.reduce(
      (sum, campaign) => sum + parseFloat(campaign.raisedAmount.toString()),
      0,
    );

    const totalDonated = user.donations.reduce(
      (sum, donation) => sum + parseFloat(donation.amount.toString()),
      0,
    );

    return {
      id: user.id,
      email: user.email ?? undefined,
      displayName: user.displayName || undefined,
      name: user.name || undefined,
      phone: user.phone || undefined,
      bio: user.bio || undefined,
      avatarUrl: user.avatarUrl || undefined,
      role: user.role,
      kycStatus: user.kycStatus,
      emailVerifiedAt: user.emailVerifiedAt || undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt || undefined,
      totalRaised,
      totalDonated,
      campaignCount: user.campaigns.length,
    };
  }

  /**
   * Get authenticated user's dashboard: profile, wallets, recent
   * transactions, unread notifications and active campaigns in a single
   * $transaction with parallel, selectively-projected queries instead of
   * six sequential round trips.
   *
   * Issue #591 — the aggregated payload is served from the warmed cache when
   * available. On a cache miss (cold start, eviction, invalidation) we fall
   * back to live computation and repopulate the cache, so there is no
   * downtime and no user-visible error.
   */
  async getDashboard(walletAddress: string): Promise<UserDashboardDto> {
    const user = await this.prisma.user.findFirst({
      where: { walletAddress, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const cached = await this.dashboardCache.get(user.id);
    if (cached) {
      return cached;
    }

    const dashboard = await this.computeDashboard(user.id);
    await this.dashboardCache.set(user.id, dashboard);
    return dashboard;
  }

  /**
   * Live dashboard computation used on cache miss and by the scheduled
   * cache-warming job.
   */
  async computeDashboard(userId: string): Promise<UserDashboardDto> {
    const [profile, wallets, recentTransactions, unreadNotifications, activeCampaigns] =
      await this.prisma.$transaction([
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            kycStatus: true,
          },
        }),
        this.prisma.wallet.findMany({
          where: { userId, deletedAt: null },
          select: { id: true, network: true, balance: true, currency: true, status: true },
        }),
        this.prisma.transaction.findMany({
          where: {
            OR: [
              { fromWallet: { userId } },
              { toWallet: { userId } },
            ],
          },
          select: { id: true, amount: true, assetCode: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.notification.findMany({
          where: { userId, isRead: false },
          select: { id: true, type: true, title: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.campaign.findMany({
          where: { creatorId: userId, status: 'ACTIVE' },
          select: { id: true, title: true, goalAmount: true, raisedAmount: true },
        }),
      ]);

    return {
      profile: {
        id: profile.id,
        email: profile.email ?? undefined,
        displayName: profile.displayName ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
        role: profile.role,
        kycStatus: profile.kycStatus,
      },
      wallets: wallets.map((w) => ({
        id: w.id,
        network: w.network,
        balance: w.balance.toString(),
        currency: w.currency,
        status: w.status,
      })),
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        amount: t.amount.toString(),
        assetCode: t.assetCode,
        status: t.status,
        createdAt: t.createdAt,
      })),
      unreadNotifications,
      activeCampaigns: activeCampaigns.map((c) => ({
        id: c.id,
        title: c.title,
        goalAmount: c.goalAmount.toString(),
        raisedAmount: c.raisedAmount.toString(),
      })),
    };
  }

  /**
   * Update authenticated user's profile
   */
  async updateMyProfile(
    walletAddress: string,
    updateDto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { walletAddress, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateDto.email && updateDto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: {
          email: updateDto.email,
          deletedAt: null,
          NOT: { id: user.id },
        },
      });
      if (existing) {
        throw new BadRequestException('Email already in use');
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      email: updateDto.email ?? user.email,
      name: updateDto.name ?? user.name,
      phone: updateDto.phone ?? user.phone,
      displayName: updateDto.displayName ?? user.displayName,
      bio: updateDto.bio ?? user.bio,
      avatarUrl: updateDto.avatarUrl ?? user.avatarUrl,
    };

    if (updateDto.preferences) {
      try {
        updateData.preferences = JSON.parse(
          updateDto.preferences,
        ) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('Invalid preferences JSON');
      }
    }

    if (updateDto.notificationPreferences) {
      try {
        const notifPrefs = JSON.parse(updateDto.notificationPreferences);
        const existingPrefs = (updateData.preferences ?? {}) as Record<string, unknown>;
        updateData.preferences = {
          ...existingPrefs,
          notifications: notifPrefs,
        } as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('Invalid notificationPreferences JSON');
      }
    }

    if (updateDto.socialLinks) {
      try {
        updateData.socialLinks = JSON.parse(
          updateDto.socialLinks,
        ) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('Invalid socialLinks JSON');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: userProfileInclude,
    });

    const totalRaised = updated.campaigns.reduce(
      (sum, campaign) => sum + parseFloat(campaign.raisedAmount.toString()),
      0,
    );

    const totalDonated = updated.donations.reduce(
      (sum, donation) => sum + parseFloat(donation.amount.toString()),
      0,
    );

    return {
      id: updated.id,
      email: updated.email ?? undefined,
      displayName: updated.displayName || undefined,
      name: updated.name || undefined,
      phone: updated.phone || undefined,
      bio: updated.bio || undefined,
      avatarUrl: updated.avatarUrl || undefined,
      role: updated.role,
      kycStatus: updated.kycStatus,
      emailVerifiedAt: updated.emailVerifiedAt || undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      deletedAt: updated.deletedAt || undefined,
      totalRaised,
      totalDonated,
      campaignCount: updated.campaigns.length,
    };
  }

  /**
   * Get public profile for a user by wallet address
   */
  async getPublicProfile(walletAddress: string): Promise<PublicUserProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { walletAddress, deletedAt: null },
      include: {
        campaigns: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with wallet address ${walletAddress} not found`,
      );
    }

    const totalRaised = user.campaigns.reduce(
      (sum, campaign) => sum + parseFloat(campaign.raisedAmount.toString()),
      0,
    );

    return {
      displayName: user.displayName || undefined,
      avatarUrl: user.avatarUrl || undefined,
      bio: user.bio || undefined,
      verifiedStatus: user.kycStatus === 'VERIFIED',
      campaignCount: user.campaigns.length,
      totalRaised,
    };
  }

  /**
   * Update KYC status for a user (admin only)
   */
  async updateKYCStatus(
    userId: string,
    status: 'VERIFIED' | 'REJECTED' | 'PENDING',
    adminId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.verifyAdminRole(adminId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: status },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_ACTION',
        resourceType: 'User',
        resourceId: userId,
        details: JSON.stringify({
          action: 'KYC_STATUS_UPDATE',
          previousStatus: user.kycStatus,
          newStatus: status,
        }),
      },
    });

    return {
      success: true,
      message: `User KYC status updated to ${status}`,
    };
  }

  /**
   * Login with email + password, returning JWT access and refresh tokens.
   *
   * Implements the account-lockout flow (Issue #232): after
   * `LOGIN_MAX_ATTEMPTS` consecutive failures, the account is locked
   * for `LOGIN_LOCKOUT_SECONDS` seconds, and subsequent logins are
   * rejected with a structured `UnauthorizedException` that surfaces
   * `retryAfterSeconds` so clients can show a clear unlock countdown.
   */
  async login(email: string, password: string): Promise<LoginResponseDto> {
    const maxAttempts = this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5);
    const lockoutSeconds = this.config.get<number>(
      'LOGIN_LOCKOUT_SECONDS',
      900,
    );

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000,
      );
      throw new UnauthorizedException({
        message: `Account locked. Try again in ${retryAfter}s`,
        retryAfterSeconds: Math.max(retryAfter, 1),
      });
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const reachedThreshold = attempts >= maxAttempts;
      const lockedUntil = reachedThreshold
        ? new Date(Date.now() + lockoutSeconds * 1000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, lockedUntil },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    // Create a tracked session in Redis
    const session = await this.sessionService.createSession({
      userId: user.id,
      walletAddress: user.walletAddress ?? '',
      role: user.role,
    });

    const accessTtlSeconds = this.config.get<number>(
      'SESSION_ACCESS_TTL_SECONDS',
      900,
    );

    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        walletAddress: user.walletAddress,
        email: user.email,
        role: user.role,
        sid: session.sessionId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: `${accessTtlSeconds}s`,
      },
    );

    const sessionTtlSeconds = this.config.get<number>(
      'SESSION_TTL_SECONDS',
      604800,
    );

    const refreshToken = this.jwt.sign(
      { sub: user.id, sid: session.sessionId },
      {
        secret: this.config.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: `${sessionTtlSeconds}s`,
      },
    );

    const cacheKey = `refresh:${user.walletAddress}`;
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    await this.cache.set(cacheKey, refreshToken, ttlMs);

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  async setupPassword(
    input: PasswordSetupInput,
  ): Promise<PasswordActionResponseDto> {
    const user = await this.findPasswordUser(input);

    if (user.passwordHash) {
      throw new BadRequestException('Password is already set');
    }

    assertStrongPassword(input.password, user);
    await this.assertPasswordNotReused(user.id, input.password);

    const passwordHash = await bcrypt.hash(
      input.password,
      this.getPasswordHashRounds(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash,
        },
      });
      await this.prunePasswordHistory(tx, user.id);
    });

    return { success: true, message: 'Password set successfully' };
  }

  async changePassword(
    input: PasswordChangeInput,
  ): Promise<PasswordActionResponseDto> {
    const user = await this.findPasswordUser(input);

    if (!user.passwordHash) {
      throw new BadRequestException('Password is not set');
    }

    const currentPasswordValid = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    assertStrongPassword(input.newPassword, user);
    await this.assertPasswordNotReused(user.id, input.newPassword);

    const passwordHash = await bcrypt.hash(
      input.newPassword,
      this.getPasswordHashRounds(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash,
        },
      });
      await this.prunePasswordHistory(tx, user.id);
    });

    return { success: true, message: 'Password changed successfully' };
  }

  /**
   * POST /users/register
   */
  async register(
    email: string,
    walletAddress: string,
    password: string,
  ): Promise<RegisterResponseDto> {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });
    if (existingEmail) {
      throw new BadRequestException('Email already in use');
    }

    const existingWallet = await this.prisma.user.findUnique({
      where: { walletAddress, deletedAt: null },
    });
    if (existingWallet) {
      throw new BadRequestException('Wallet address already in use');
    }

    const passwordContext = { email, walletAddress };
    assertStrongPassword(password, passwordContext);
    const passwordHash = await bcrypt.hash(
      password,
      this.getPasswordHashRounds(),
    );

    const user = await this.prisma.user.create({
      data: {
        walletAddress,
        email,
        passwordHash,
        role: 'USER',
      },
    });

    await this.prisma.passwordHistory.create({
      data: {
        userId: user.id,
        passwordHash,
      },
    });

    const token = this.generateConfirmationToken();
    const tokenHash = this.hashToken(token);

    const expiresHours = this.config.get<number>(
      'EMAIL_TOKEN_EXPIRES_HOURS',
      24,
    );
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      message: 'Registration successful. Please confirm your email.',
    };
  }

  /**
   * POST /users/confirm-email
   */
  async confirmEmail(token: string): Promise<RegisterResponseDto> {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    const tokenHash = this.hashToken(token);

    const verification = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!verification || !verification.user) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (verification.usedAt) {
      throw new BadRequestException('Token already used');
    }

    if (verification.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    return { message: 'Email confirmed successfully.' };
  }

  /**
   * Get or create user by wallet address
   */
  async getOrCreateUser(email: string) {
    let user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          role: 'DONOR',
        },
      });

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_CREATED',
          resourceType: 'User',
          resourceId: user.id,
          details: JSON.stringify({ email }),
        },
      });
    }

    return user;
  }

  /**
   * Update user role (admin only)
   */
  async updateUserRole(
    userId: string,
    role: UserRole,
    adminId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.verifyAdminRole(adminId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_ACTION',
        resourceType: 'User',
        resourceId: userId,
        details: JSON.stringify({
          action: 'ROLE_UPDATE',
          previousRole: user.role,
          newRole: role,
        }),
      },
    });

    return {
      success: true,
      message: `User role updated to ${role}`,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateConfirmationToken(): string {
    return randomBytes(24).toString('hex');
  }

  private async findPasswordUser(input: {
    userId?: string;
    walletAddress?: string;
  }): Promise<PasswordUser> {
    const userFilters = [
      ...(input.userId ? [{ id: input.userId }] : []),
      ...(input.walletAddress ? [{ walletAddress: input.walletAddress }] : []),
    ];

    if (userFilters.length === 0) {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: userFilters,
      },
      select: {
        id: true,
        walletAddress: true,
        email: true,
        displayName: true,
        name: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async assertPasswordNotReused(
    userId: string,
    password: string,
  ): Promise<void> {
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_LIMIT,
      select: { passwordHash: true },
    });

    for (const item of history) {
      if (await bcrypt.compare(password, item.passwordHash)) {
        throw new BadRequestException(
          'Password was recently used. Choose a different password',
        );
      }
    }
  }

  private async prunePasswordHistory(
    tx: Pick<PrismaService, 'passwordHistory'>,
    userId: string,
  ): Promise<void> {
    const history = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: PASSWORD_HISTORY_LIMIT,
      select: { id: true },
    });

    if (history.length === 0) {
      return;
    }

    await tx.passwordHistory.deleteMany({
      where: {
        id: { in: history.map((item) => item.id) },
      },
    });
  }

  private getPasswordHashRounds(): number {
    const configuredRounds = this.config.get<number | string>(
      'PASSWORD_BCRYPT_ROUNDS',
      12,
    );
    const parsedRounds = Number(configuredRounds);

    return Number.isInteger(parsedRounds) && parsedRounds > 0
      ? parsedRounds
      : 12;
  }

  /**
   * Admin-only: clear `loginAttempts` and `lockedUntil` for a user so
   * they can log in again. This is the manual "unlock" surface for
   * Issue #232 — typically used after a user proves ownership of the
   * account out-of-band (support ticket, email confirmation, etc.).
   */
  async unlockUser(
    userId: string,
    adminId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.verifyAdminRole(adminId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.loginAttempts === 0 && !user.lockedUntil) {
      return {
        success: true,
        message: 'User account is not locked',
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_ACTION',
        resourceType: 'User',
        resourceId: userId,
        details: JSON.stringify({
          action: 'ACCOUNT_UNLOCK',
          previousLoginAttempts: user.loginAttempts,
          previousLockedUntil: user.lockedUntil?.toISOString() ?? null,
        }),
      },
    });

    return {
      success: true,
      message: 'User account unlocked successfully',
    };
  }

  /**
   * Verify that the user has ADMIN role
   * @param adminId - User ID or wallet address to verify
   * @throws ForbiddenException if user is not an admin
   */
  private async verifyAdminRole(adminId: string): Promise<void> {
    const admin = await this.prisma.user.findFirst({
      where: {
        OR: [{ id: adminId }, { walletAddress: adminId }],
        deletedAt: null,
      },
    });

    if (!admin) {
      throw new ForbiddenException('User not found');
    }

    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }
}
