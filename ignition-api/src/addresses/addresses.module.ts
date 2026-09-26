import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { ApiKeyExpirationService } from '../api-keys/api-key-expiration.service';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';



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
  controllers: [AddressesController],
  providers: [
    AddressesService,
    JwtAuthGuard,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyExpirationService,
  ],
})
export class AddressesModule {}
