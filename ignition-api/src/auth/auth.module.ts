import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionModule } from '../session/session.module';
import { SettingsModule } from '../settings/settings.module';
import { AuthChallengeController } from './auth-challenge.controller';
import { AuthVerifyController } from './auth-verify.controller';
import { AuthLogoutController } from './auth-logout.controller';
import { AuthRefreshController } from './auth-refresh.controller';
import { AuthTokenService } from './auth-token.service';
import { AuthChallengeService } from './auth-challenge.service';
import { JwtMiddleware } from './jwt.middleware';
import { JwtStrategy } from './jwt.strategy';
import { PermissionsService } from './permissions/permissions.service';
import { PermissionsGuard } from './permissions/permissions.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: `${config.get<number>('SESSION_ACCESS_TTL_SECONDS', 900)}s`,
        },
      }),
    }),
    PrismaModule,
    SessionModule,
    SettingsModule,
  ],
  controllers: [
    AuthChallengeController,
    AuthVerifyController,
    AuthLogoutController,
    AuthRefreshController,
  ],
  providers: [
    AuthTokenService,
    JwtMiddleware,
    JwtStrategy,
    AuthChallengeService,
    JwtMiddleware,
    PermissionsService,
    PermissionsGuard,
  ],
  exports: [
    JwtModule,
    AuthTokenService,
    JwtMiddleware,
    JwtStrategy,
    PassportModule,
    PermissionsService,
    PermissionsGuard,
  ],
})
export class AuthModule {}