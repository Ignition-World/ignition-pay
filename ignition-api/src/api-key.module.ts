import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiKeyExpirationService } from './api-keys/api-key-expiration.service';

@Module({})
export class ApiKeyModule implements OnApplicationBootstrap {
  constructor(private readonly moduleRef: ModuleRef) {}
  async onApplicationBootstrap(): Promise<void> {
    await this.moduleRef.get(ApiKeyExpirationService, { strict: false }).expireApiKeys();
  }
}
