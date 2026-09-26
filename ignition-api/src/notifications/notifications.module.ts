import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { StellarSseConsumerService } from './stellar-sse-consumer.service';

/**
 * Issue #265 — Stellar SSE → Notifications pipeline.
 *
 * - StellarSseConsumerService: subscribes to Horizon payment SSE streams
 *   (one per active wallet) and persists NotificationType events.
 * - NotificationsService: CRUD layer for the `notifications` table.
 *
 * Both are exported so other modules (e.g. a future WebSocket gateway or
 * push-notification dispatcher) can consume NotificationsService directly.
 */
@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, StellarSseConsumerService],
  exports: [NotificationsService, StellarSseConsumerService],
})
export class NotificationsModule {}
