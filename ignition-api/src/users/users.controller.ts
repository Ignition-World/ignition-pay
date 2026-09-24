import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Param,
  Body,
  UseFilters,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import {
  ChangePasswordDto,
  PasswordActionResponseDto,
  SetupPasswordDto,
} from './dto/password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateKYCStatusDto } from './dto/update-kyc-status.dto';
import { UserProfileDto, PublicUserProfileDto } from './dto/user-profile.dto';
import { UserDashboardDto } from './dto/dashboard.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { RequirePermissions } from '../auth/permissions/require-permissions.decorator';
import { Permission } from '../auth/permissions/permissions.map';
import { AuthExceptionFilter } from '../auth/filters/auth-exception.filter';
import { AuthErrorResponseDto } from '../common/dto/error-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateNotificationPreferencesDto } from '../notifications/dto/notification-preferences.dto';

interface AuthenticatedRequest {
  user: {
    sub?: string;
    userId?: string;
    walletAddress?: string;
  };
}

/**
 * Extracts and validates walletAddress from the JWT user payload.
 * Throws UnauthorizedException if missing or empty (Issue #127).
 */
function resolveWalletAddress(req: AuthenticatedRequest): string {
  const addr = req.user?.walletAddress;
  if (!addr) {
    throw new UnauthorizedException('Wallet address not found in token');
  }
  return addr;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * POST /users/register
   * Register with email + password + walletAddress.
   */
  @Post('register')
  @Throttle({
    strict: {
      limit: process.env.THROTTLE_STRICT_LIMIT
        ? Number(process.env.THROTTLE_STRICT_LIMIT)
        : 5,
      ttl: process.env.THROTTLE_STRICT_TTL
        ? Number(process.env.THROTTLE_STRICT_TTL)
        : 60_000,
    },
  })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.usersService.register(
      dto.email,
      dto.walletAddress,
      dto.password,
    );
  }

  /**
   * POST /users/confirm-email
   * Confirm email using confirmation token.
   */
  @Post('confirm-email')
  async confirmEmail(
    @Body() dto: ConfirmEmailDto,
  ): Promise<RegisterResponseDto> {
    return this.usersService.confirmEmail(dto.token);
  }

  /**
   * POST /users/login
   * Authenticate with email + password, returns access and refresh tokens.
   * Applies the auth error filter (Issue #229) so 400/401/503 responses
   * share the same canonical envelope as `/auth/*`.
   */
  @Post('login')
  @UseFilters(AuthExceptionFilter)
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 201, description: 'User logged in successfully' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account locked',
    type: AuthErrorResponseDto,
  })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.usersService.login(dto.email, dto.password);
  }

  /**
   * POST /users/password/setup
   * Set the first password for an authenticated wallet-created account.
   */
  @UseGuards(JwtAuthGuard)
  @Post('password/setup')
  async setupPassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SetupPasswordDto,
  ): Promise<PasswordActionResponseDto> {
    return this.usersService.setupPassword({
      userId: req.user.sub,
      walletAddress: resolveWalletAddress(req),
      password: dto.password,
    });
  }

  /**
   * PATCH /users/password
   * Change the authenticated user's password after confirming the current one.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('password')
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<PasswordActionResponseDto> {
    return this.usersService.changePassword({
      userId: req.user.sub,
      walletAddress: resolveWalletAddress(req),
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
  }

  /**
   * GET /users/me
   * Retrieve authenticated user's full profile
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyProfile(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserProfileDto> {
    return this.usersService.getMyProfile(resolveWalletAddress(req));
  }

  /**
   * GET /users/me/notification-preferences
   * Per-type, per-channel (email/push/inApp) notification preferences.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/notification-preferences')
  async getNotificationPreferences(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub || req.user.userId;
    if (!userId) {
      throw new UnauthorizedException('User id not found in token');
    }
    return this.notificationsService.getPreferences(userId);
  }

  /**
   * PUT /users/me/notification-preferences
   * Merge a partial preference update over the existing preferences.
   */
  @UseGuards(JwtAuthGuard)
  @Put('me/notification-preferences')
  async updateNotificationPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    const userId = req.user.sub || req.user.userId;
    if (!userId) {
      throw new UnauthorizedException('User id not found in token');
    }
    return this.notificationsService.updatePreferences(
      userId,
      dto.preferences,
    );
   * GET /users/me/dashboard
   * Aggregated dashboard data for the authenticated user.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/dashboard')
  async getMyDashboard(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserDashboardDto> {
    return this.usersService.getDashboard(resolveWalletAddress(req));
  }

  /**
   * GET /users/me/permissions
   * Returns the permission list for the authenticated user's role.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me/permissions')
  getMyPermissions(@Request() req: any): Permission[] {
    return this.permissionsService.getUserPermissions(req.user.role);
  }

  /**
   * PATCH /users/me
   * Update authenticated user's profile
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMyProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    return this.usersService.updateMyProfile(
      resolveWalletAddress(req),
      updateDto,
    );
  }

  /**
   * GET /users/profile
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(
    @Request() req: AuthenticatedRequest,
  ): Promise<UserProfileDto> {
    return this.usersService.getMyProfile(resolveWalletAddress(req));
  }

  /**
   * PUT /users/profile
   */
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async putProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    return this.usersService.updateMyProfile(
      resolveWalletAddress(req),
      updateDto,
    );
  }

  /**
   * GET /users/:walletAddress
   */
  @Get(':walletAddress')
  async getPublicProfile(
    @Param('walletAddress') walletAddress: string,
  ): Promise<PublicUserProfileDto> {
    return this.usersService.getPublicProfile(walletAddress);
  }
}

@ApiTags('admin/users')
@ApiBearerAuth('JWT-auth')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * PATCH /admin/users/:id/kyc
   */
  @UseGuards(JwtAuthGuard, AdminGuard, PermissionsGuard)
  @Patch(':id/kyc')
  @RequirePermissions(Permission.ADMIN_USERS_KYC)
  async updateKYCStatus(
    @Param('id') userId: string,
    @Body() updateDto: UpdateKYCStatusDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    return this.usersService.updateKYCStatus(
      userId,
      updateDto.status,
      resolveWalletAddress(req),
    );
  }

  /**
   * PATCH /admin/users/:id/role
   * Update user's role (admin only)
   */
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  @RequirePermissions(Permission.ADMIN_USERS_ROLE)
  async updateUserRole(
    @Param('id') userId: string,
    @Body() updateDto: UpdateUserRoleDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    const adminId =
      req.user.sub || req.user.userId || req.user.walletAddress || '';
    return this.usersService.updateUserRole(userId, updateDto.role, adminId);
  }

  /**
   * PATCH /admin/users/:id/unlock
   * Manually unlock an account locked by the failed-login policy
   * (Issue #232). Resets loginAttempts to 0 and clears lockedUntil.
   */
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/unlock')
  @RequirePermissions(Permission.ADMIN_USERS_ROLE)
  async unlockUser(
    @Param('id') userId: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    const adminId = req.user.sub || req.user.userId || req.user.walletAddress;
    return this.usersService.unlockUser(userId, adminId);
  }
}
