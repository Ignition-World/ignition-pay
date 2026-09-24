import { Module, forwardRef } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionModule } from '../session/session.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AddressGenerationThrottleMonitorService } from '../throttler/address-generation-throttle-monitor.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    forwardRef(() => SessionModule), // Handle circular dependency
  ],
  providers: [SettingsService, AddressGenerationThrottleMonitorService],
  controllers: [SettingsController],
  exports: [SettingsService, AddressGenerationThrottleMonitorService], // Export so other modules can use it
})
export class SettingsModule {}