import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyScopeGuard } from '../api-keys/api-key-scope.guard';
import { ApiKeyExpirationService } from '../api-keys/api-key-expiration.service';
import { QUEUE_EMAIL } from '../queue/queue.constants';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: QUEUE_EMAIL }),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    PermissionsService,
    PermissionsGuard,
    ApiKeyGuard,
    ApiKeyScopeGuard,
    ApiKeyExpirationService,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
