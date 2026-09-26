import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard'
import { Sep38Controller } from './sep38.controller'
import { Sep38Service } from './sep38.service'

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
  controllers: [Sep38Controller],
  providers: [Sep38Service, JwtAuthGuard],
})
export class Sep38Module {}
