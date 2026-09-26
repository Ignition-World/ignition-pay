import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { UsersController, AdminUsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { SessionModule } from '../session/session.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailVerificationTokenScheduler } from './email-verification-token.scheduler';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SessionModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [
    UsersService,
    JwtAuthGuard,
    AdminGuard,
    RolesGuard,
    PermissionsService,
    PermissionsGuard,
    // Issue #617 — purges spent email verification tokens on a timer.
    EmailVerificationTokenScheduler,
  ],
  exports: [UsersService],
})
export class UsersModule {}
