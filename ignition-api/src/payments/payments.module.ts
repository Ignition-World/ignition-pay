import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { ApiKeyExpirationService } from '../api-keys/api-key-expiration.service';
import { QUEUE_PAYMENTS } from '../queue/queue.constants';
import { UsersModule } from '../users/users.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    // Register the payments queue so @InjectQueue(QUEUE_PAYMENTS) resolves
    // inside PaymentsService. The queue itself is also registered in QueueModule
    // (where the processor lives), but BullModule.registerQueue is idempotent.
    BullModule.registerQueue({ name: QUEUE_PAYMENTS }),
    // Issue #591 — invalidate the warmed dashboard cache on new transactions.
    UsersModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyExpirationService,
  ],
})
export class PaymentsModule {}
