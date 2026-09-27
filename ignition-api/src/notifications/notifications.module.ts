import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { StellarSseConsumerService } from './stellar-sse-consumer.service';
import { NotificationDedupStore } from './notification-dedup.store';
import { NotificationDedupController } from './notification-dedup.controller';
import { SessionModule } from '../session/session.module';

/**
 * Issue #265 — Stellar SSE → Notifications pipeline.
 *
 * - StellarSseConsumerService: subscribes to Horizon payment SSE streams
 *   (one per active wallet) and persists NotificationType events.
 * - NotificationsService: CRUD layer for the `notifications` table.
 *
 * - NotificationDedupStore: issue #623, the Redis window that stops a bulk
 *   event fanning out several copies of the same notification to one user.
 *
 * Both services are exported so other modules (e.g. a future WebSocket gateway or
 * push-notification dispatcher) can consume NotificationsService directly. The
 * dedup store is exported too, so a producer that batches its own writes can
 * claim the same windows rather than bypassing them.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    // SessionGuard lives in SessionModule, which reaches back here through
    // SettingsModule; forwardRef breaks that cycle the same way those two do.
    forwardRef(() => SessionModule),
  ],
  controllers: [NotificationDedupController],
  providers: [
    NotificationsService,
    StellarSseConsumerService,
    NotificationDedupStore,
  ],
  exports: [
    NotificationsService,
    StellarSseConsumerService,
    NotificationDedupStore,
  ],
})
export class NotificationsModule {}
