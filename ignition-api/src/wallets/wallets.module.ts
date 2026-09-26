import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { ApiKeyExpirationService } from '../api-keys/api-key-expiration.service';
import { WalletLimitService } from '../wallet/services/wallet-limit.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [WalletsController],
  providers: [
    WalletsService,
    JwtAuthGuard,
    PermissionsService,
    PermissionsGuard,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyExpirationService,
    WalletLimitService,
  ],
})
export class WalletsModule {}
