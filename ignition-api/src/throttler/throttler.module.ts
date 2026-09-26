import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerRedisStorage } from './throttler-redis.storage';
import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('THROTTLE_DEFAULT_TTL', 60_000),
            limit: config.get<number>('THROTTLE_DEFAULT_LIMIT', 100),
          },
          {
            name: 'strict',
            ttl: config.get<number>('THROTTLE_STRICT_TTL', 60_000),
            limit: config.get<number>('THROTTLE_STRICT_LIMIT', 5),
          },
        ],
        storage: new ThrottlerRedisStorage(config),
      }),
    }),
    SettingsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
  exports: [ThrottlerModule],
})


export class AppThrottlerModule {}
