import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const rolesList = Array.isArray(requiredRoles)
      ? requiredRoles.filter((r) => r !== undefined && r !== null)
      : [];

    if (rolesList.length === 0) {
      throw new ForbiddenException(
        'Forbidden resource: insufficient permissions',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Identify user by id (which is payload.sub) or walletAddress
    const userId = user.sub || user.userId;
    const walletAddress = user.walletAddress;

    let dbUser;
    if (userId) {
      dbUser = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
      });
    } else if (walletAddress) {
      dbUser = await this.prisma.user.findFirst({
        where: { walletAddress, deletedAt: null },
      });
    }

    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    const hasRole = rolesList.includes(dbUser.role);
    if (!hasRole) {
      throw new ForbiddenException(
        'Forbidden resource: insufficient permissions',
      );
    }

    return true;
  }
}
