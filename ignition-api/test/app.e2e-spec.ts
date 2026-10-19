import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $transaction: jest.fn(),
        apiKey: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      })
      .overrideProvider(getStorageToken())
      .useClass(ThrottlerStorageService)
      .overrideProvider(CACHE_MANAGER)
      .useValue({
        set: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/auth/challenge (GET) - should rate limit after 5 requests', async () => {
    const walletAddress = 'GBKXNRTZQVD6CNOQNRZVMJVQ4ZQ5KABCDEF12345';
    // Send 5 requests, which should all succeed
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .get('/auth/challenge')
        .query({ walletAddress })
        .expect(200);
    }

    // The 6th request should fail with a 429 Too Many Requests
    await request(app.getHttpServer())
      .get('/auth/challenge')
      .query({ walletAddress })
      .expect(429);
  });
});
