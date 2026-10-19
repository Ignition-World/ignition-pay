import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerOptions } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerRedisStorage } from './throttler-redis.storage';
import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';
import { SettingsModule } from '../settings/settings.module';
import {
  THROTTLE_TIERS,
  ThrottleTier,
  hasThrottleOverride,
  tierOf,
} from './throttler-tiers';

export function buildThrottlers(config: ConfigService): ThrottlerOptions[] {
  const tier = (name: ThrottleTier): ThrottlerOptions => {
    const env = name.toUpperCase();
    return {
      name,
      ttl: Number(config.get(`THROTTLE_${env}_TTL`, THROTTLE_TIERS[name].ttl)),
      limit: Number(config.get(`THROTTLE_${env}_LIMIT`, THROTTLE_TIERS[name].limit)),
      skipIf: (ctx) => tierOf(ctx) !== name,
    };
  };

  return [
    tier('auth'),
    tier('public'),
    tier('authenticated'),
    // Opt-in per-route overrides (applied in addition to the tier limit).
    {
      name: 'default',
      ttl: Number(config.get('THROTTLE_DEFAULT_TTL', 60_000)),
      limit: Number(config.get('THROTTLE_DEFAULT_LIMIT', 100)),
      skipIf: (ctx) => !hasThrottleOverride(ctx, 'default'),
    },
    {
      name: 'strict',
      ttl: Number(config.get('THROTTLE_STRICT_TTL', 60_000)),
      limit: Number(config.get('THROTTLE_STRICT_LIMIT', 5)),
      skipIf: (ctx) => !hasThrottleOverride(ctx, 'strict'),
    },
  ];
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: buildThrottlers(config),
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
