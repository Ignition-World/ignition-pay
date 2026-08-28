import {
  Module,
  NestModule,
  MiddlewareConsumer,
  OnModuleInit,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggingInterceptor } from './common/logging/logging.interceptor';
import { LoggerModule } from './common/logging/logger.module';
import { ApiKeyScopeInterceptor } from './api-keys/api-key-gateway.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AppThrottlerModule } from './throttler/throttler.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PaymentsModule } from './payments/payments.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { SessionModule } from './session/session.module';
import { AddressesModule } from './addresses/addresses.module';
import { ConfigValidationService } from './config/validation';
import { CryptoModule } from './common/crypto/crypto.module';
import { SentryMiddleware } from './common/sentry/sentry.middleware';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeyExpirationService } from './api-keys/api-key-expiration.service';
import { NotificationsModule } from './notifications/notifications.module';
import { Sep24Module } from './sep24/sep24.module';
import { SettingsModule } from './settings/settings.module';
import { Sep38Module } from './sep38/sep38.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CryptoModule,
    LoggerModule,
    PrismaModule,
    QueueModule,
    RedisModule,
    HealthModule,
    SessionModule,
    AuthModule,
    AppThrottlerModule,
    ApiKeysModule,
    CampaignsModule,
    UsersModule,
    WalletsModule,
    TransactionsModule,
    PaymentsModule,
    AddressesModule,
    AnalyticsModule,
    NotificationsModule,
    Sep24Module,
    SettingsModule,
    Sep38Module,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigValidationService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiKeyScopeInterceptor,
    },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  constructor(
    private readonly apiKeyExpirationService: ApiKeyExpirationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.apiKeyExpirationService.deactivateExpiredKeys();
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SentryMiddleware).forRoutes('*');
  }
}