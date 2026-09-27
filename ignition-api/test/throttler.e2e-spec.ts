/**
 * E2E: per-endpoint rate limiting.
 *
 * Boots a minimal Nest app with the real throttler configuration and guard
 * (in-memory storage, no Redis) and verifies each tier trips at its
 * configured threshold with a 429 + Retry-After.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { buildThrottlers } from '../src/throttler/throttler.module';
import { ThrottlerBehindProxyGuard } from '../src/throttler/throttler-behind-proxy.guard';
import { THROTTLE_TIERS } from '../src/throttler/throttler-tiers';

const JWT_SECRET = 'throttle-e2e-secret';

@Controller('auth')
class AuthProbeController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Controller('public')
class PublicProbeController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

describe('Rate limiting per endpoint (E2E)', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: JWT_SECRET });
  const tokenFor = (sub: string) => jwt.sign({ sub });

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: buildThrottlers(new ConfigService({})) }),
      ],
      controllers: [AuthProbeController, PublicProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function hit(path: string, times: number, headers: Record<string, string> = {}) {
    let last: request.Response | undefined;
    for (let i = 0; i < times; i++) {
      last = await request(app.getHttpServer()).get(path).set(headers);
      if (i < times - 1) expect(last.status).toBe(200);
    }
    return last!;
  }

  it(`auth endpoints allow ${THROTTLE_TIERS.auth.limit} req/min then return 429 with Retry-After`, async () => {
    const ok = await hit('/auth/ping', THROTTLE_TIERS.auth.limit);
    expect(ok.status).toBe(200);

    const blocked = await request(app.getHttpServer()).get('/auth/ping');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it(`public endpoints allow ${THROTTLE_TIERS.public.limit} req/min per IP`, async () => {
    const ok = await hit('/public/ping', THROTTLE_TIERS.public.limit);
    expect(ok.status).toBe(200);

    const blocked = await request(app.getHttpServer()).get('/public/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // A different client IP has its own counter
    await request(app.getHttpServer())
      .get('/public/ping')
      .set('x-forwarded-for', '10.0.0.99')
      .expect(200);
  });

  it(`authenticated requests allow ${THROTTLE_TIERS.authenticated.limit} req/min per user`, async () => {
    const alice = { Authorization: `Bearer ${tokenFor('alice')}` };
    const ok = await hit('/public/ping', THROTTLE_TIERS.authenticated.limit, alice);
    expect(ok.status).toBe(200);

    const blocked = await request(app.getHttpServer()).get('/public/ping').set(alice);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // Another user from the same IP is tracked separately
    await request(app.getHttpServer())
      .get('/public/ping')
      .set({ Authorization: `Bearer ${tokenFor('bob')}` })
      .expect(200);
  });
});
