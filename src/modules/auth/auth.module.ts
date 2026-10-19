import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { EmailVerificationCleanupService } from './tasks/email-verification-cleanup.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([EmailVerificationToken]),
  ],
  providers: [EmailVerificationCleanupService],
  exports: [EmailVerificationCleanupService],
})
export class AuthModule {}