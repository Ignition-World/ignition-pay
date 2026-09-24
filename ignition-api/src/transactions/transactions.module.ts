import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { ApiKeyExpirationService } from '../api-keys/api-key-expiration.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { StaleTransactionMonitorService } from './stale-transaction-monitor.service';
import { QUEUE_EMAIL, QUEUE_HORIZON } from '../queue/queue.constants';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: QUEUE_EMAIL }, { name: QUEUE_HORIZON }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    JwtAuthGuard,
    PermissionsService,
    PermissionsGuard,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyExpirationService,
    StaleTransactionMonitorService,
  ],
  exports: [StaleTransactionMonitorService],
})
export class TransactionsModule {}
