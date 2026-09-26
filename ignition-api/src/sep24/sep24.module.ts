import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard'
import { Sep24Controller } from './sep24.controller'
import { Sep24CallbackController } from './sep24-callback.controller'
import { Sep24Service } from './sep24.service'
import { Sep24WebhookVerificationService } from './sep24-webhook-verification.service'
import { Sep24WebhookGuard } from './sep24-webhook.guard'

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [Sep24Controller, Sep24CallbackController],
  providers: [
    Sep24Service,
    JwtAuthGuard,
    Sep24WebhookVerificationService,
    Sep24WebhookGuard,
  ],
  exports: [Sep24WebhookVerificationService],
})
export class Sep24Module {}
