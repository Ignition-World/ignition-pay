import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { DataExportService } from './data-export.service';

/**
 * Issue #619 — GDPR data export.
 *
 * Provides the shared DataExportService (which holds the in-memory export
 * store) to both the users controller and the Bull processor.
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
