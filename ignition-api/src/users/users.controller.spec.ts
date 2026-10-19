import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { UsersController, AdminUsersController } from './users.controller';
import { UsersService } from './users.service';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, KycStatus } from '@prisma/client';

describe('UsersController & AdminUsersController', () => {
  let usersController: UsersController;
  let adminUsersController: AdminUsersController;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'register'
      | 'confirmEmail'
      | 'login'
      | 'setupPassword'
      | 'changePassword'
      | 'getMyProfile'
      | 'updateMyProfile'
      | 'getPublicProfile'
      | 'updateKYCStatus'
      | 'updateUserRole'
    >
  >;
  let permissionsService: jest.Mocked<
    Pick<PermissionsService, 'getUserPermissions'>
  >;

  beforeEach(async () => {
    usersService = {
      register: jest.fn(),
      confirmEmail: jest.fn(),
      login: jest.fn(),
      setupPassword: jest.fn(),
      changePassword: jest.fn(),
      getMyProfile: jest.fn(),
      updateMyProfile: jest.fn(),
      getPublicProfile: jest.fn(),
      updateKYCStatus: jest.fn(),
      updateUserRole: jest.fn(),
    };

    permissionsService = {
      getUserPermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController, AdminUsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: PermissionsService, useValue: permissionsService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    usersController = module.get<UsersController>(UsersController);
    adminUsersController =
      module.get<AdminUsersController>(AdminUsersController);
  });

  it('should be defined', () => {
    expect(usersController).toBeDefined();
    expect(adminUsersController).toBeDefined();
  });

  describe('UsersController', () => {
    it('register() should call usersService.register', async () => {
      const dto = {
        email: 'test@example.com',
        walletAddress: 'G123',
        password: 'Password123!',
      };
      usersService.register.mockResolvedValue({ id: 'user-1' } as any);
      const res = await usersController.register(dto);
      expect(usersService.register).toHaveBeenCalledWith(
        dto.email,
        dto.walletAddress,
        dto.password,
      );
      expect(res).toEqual({ id: 'user-1' });
    });

    it('confirmEmail() should call usersService.confirmEmail', async () => {
      const dto = { token: 'verify-token' };
      usersService.confirmEmail.mockResolvedValue({ id: 'user-1' } as any);
      const res = await usersController.confirmEmail(dto);
      expect(usersService.confirmEmail).toHaveBeenCalledWith(dto.token);
      expect(res).toEqual({ id: 'user-1' });
    });

    it('login() should call usersService.login', async () => {
      const dto = { email: 'test@example.com', password: 'Password123!' };
      usersService.login.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      } as any);
      const res = await usersController.login(dto);
      expect(usersService.login).toHaveBeenCalledWith(dto.email, dto.password);
      expect(res).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('setupPassword() should call usersService.setupPassword', async () => {
      const req = { user: { sub: 'user-1', walletAddress: 'G123' } };
      const dto = { password: 'Password123!' };
      usersService.setupPassword.mockResolvedValue({ success: true } as any);
      const res = await usersController.setupPassword(req, dto);
      expect(usersService.setupPassword).toHaveBeenCalledWith({
        userId: 'user-1',
        walletAddress: 'G123',
        password: dto.password,
      });
      expect(res).toEqual({ success: true });
    });

    it('changePassword() should call usersService.changePassword', async () => {
      const req = { user: { sub: 'user-1', walletAddress: 'G123' } };
      const dto = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      };
      usersService.changePassword.mockResolvedValue({ success: true } as any);
      const res = await usersController.changePassword(req, dto);
      expect(usersService.changePassword).toHaveBeenCalledWith({
        userId: 'user-1',
        walletAddress: 'G123',
        currentPassword: dto.currentPassword,
        newPassword: dto.newPassword,
      });
      expect(res).toEqual({ success: true });
    });

    it('getMyProfile() should call usersService.getMyProfile', async () => {
      const req = { user: { walletAddress: 'G123' } };
      usersService.getMyProfile.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      } as any);
      const res = await usersController.getMyProfile(req);
      expect(usersService.getMyProfile).toHaveBeenCalledWith('G123');
      expect(res).toEqual({ id: 'user-1', email: 'test@example.com' });
    });

    it('getMyPermissions() should call permissionsService.getUserPermissions', () => {
      const req = { user: { role: 'USER' } };
      permissionsService.getUserPermissions.mockReturnValue(['read' as any]);
      const res = usersController.getMyPermissions(req);
      expect(permissionsService.getUserPermissions).toHaveBeenCalledWith(
        'USER',
      );
      expect(res).toEqual(['read']);
    });

    it('updateMyProfile() should call usersService.updateMyProfile', async () => {
      const req = { user: { walletAddress: 'G123' } };
      const updateDto = { displayName: 'New Name' };
      usersService.updateMyProfile.mockResolvedValue({
        id: 'user-1',
        displayName: 'New Name',
      } as any);
      const res = await usersController.updateMyProfile(req, updateDto);
      expect(usersService.updateMyProfile).toHaveBeenCalledWith(
        'G123',
        updateDto,
      );
      expect(res).toEqual({ id: 'user-1', displayName: 'New Name' });
    });

    it('getProfile() should call usersService.getMyProfile', async () => {
      const req = { user: { walletAddress: 'G123' } };
      usersService.getMyProfile.mockResolvedValue({ id: 'user-1' } as any);
      const res = await usersController.getProfile(req);
      expect(usersService.getMyProfile).toHaveBeenCalledWith('G123');
      expect(res).toEqual({ id: 'user-1' });
    });

    it('putProfile() should call usersService.updateMyProfile', async () => {
      const req = { user: { walletAddress: 'G123' } };
      const updateDto = { displayName: 'New Name' };
      usersService.updateMyProfile.mockResolvedValue({ id: 'user-1' } as any);
      const res = await usersController.putProfile(req, updateDto);
      expect(usersService.updateMyProfile).toHaveBeenCalledWith(
        'G123',
        updateDto,
      );
      expect(res).toEqual({ id: 'user-1' });
    });

    it('getPublicProfile() should call usersService.getPublicProfile', async () => {
      usersService.getPublicProfile.mockResolvedValue({
        displayName: 'Public User',
      } as any);
      const res = await usersController.getPublicProfile('G123');
      expect(usersService.getPublicProfile).toHaveBeenCalledWith('G123');
      expect(res).toEqual({ displayName: 'Public User' });
    });
  });

  describe('AdminUsersController', () => {
    it('updateKYCStatus() should call usersService.updateKYCStatus', async () => {
      const req = { user: { walletAddress: 'GAdmin' } };
      const dto = { status: KycStatus.VERIFIED };
      usersService.updateKYCStatus.mockResolvedValue({
        success: true,
        message: 'KYC verified',
      });
      const res = await adminUsersController.updateKYCStatus(
        'user-1',
        dto,
        req,
      );
      expect(usersService.updateKYCStatus).toHaveBeenCalledWith(
        'user-1',
        KycStatus.VERIFIED,
        'GAdmin',
      );
      expect(res).toEqual({ success: true, message: 'KYC verified' });
    });

    it('updateUserRole() should call usersService.updateUserRole', async () => {
      const req = { user: { sub: 'admin-1' } };
      const dto = { role: UserRole.ADMIN };
      usersService.updateUserRole.mockResolvedValue({
        success: true,
        message: 'Role updated',
      });
      const res = await adminUsersController.updateUserRole('user-1', dto, req);
      expect(usersService.updateUserRole).toHaveBeenCalledWith(
        'user-1',
        UserRole.ADMIN,
        'admin-1',
      );
      expect(res).toEqual({ success: true, message: 'Role updated' });
    });
  });

  // Issue #127 & #128: defensive walletAddress handling and missing coverage
  describe('defensive walletAddress handling (Issue #127)', () => {
    it('getMyProfile() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: {} };
      await expect(usersController.getMyProfile(req as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('updateMyProfile() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: {} };
      await expect(
        usersController.updateMyProfile(req as any, { displayName: 'Test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('getProfile() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: {} };
      await expect(usersController.getProfile(req as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('putProfile() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: {} };
      await expect(
        usersController.putProfile(req as any, { displayName: 'Test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('setupPassword() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: { sub: 'user-1' } };
      await expect(
        usersController.setupPassword(req as any, { password: 'Pass123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('changePassword() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: { sub: 'user-1' } };
      await expect(
        usersController.changePassword(req as any, {
          currentPassword: 'Old1!',
          newPassword: 'New1!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updateKYCStatus() throws UnauthorizedException when walletAddress is missing', async () => {
      const req = { user: {} };
      const dto = { status: KycStatus.VERIFIED };
      await expect(
        adminUsersController.updateKYCStatus('user-1', dto, req as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
