/**
 * Integration: auth refresh-token round trip
 *   issue → validate → rotate → reuse detection → revoke all
 *
 * Boots the real AuthRefreshController, AuthTokenService and JwtStrategy on
 * an Express server and drives it with Supertest. Prisma and settings are
 * stubbed; the cache is a real in-memory Keyv instance.
 */
import { Controller, Get, INestApplication, UseGuards, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import Keyv from 'keyv';
import request from 'supertest';

import { AuthRefreshController } from '../src/auth/auth-refresh.controller';
import { AuthTokenService } from '../src/auth/auth-token.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PermissionsService } from '../src/auth/permissions/permissions.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';

const JWT_SECRET = 'e2e-access-secret';
const REFRESH_TOKEN_SECRET = 'e2e-refresh-secret';

const user = {
  id: 'user-1',
  walletAddress: 'GTESTWALLETADDRESS',
  role: 'USER',
  isActive: true,
  deletedAt: null,
};

@Controller('probe')
class ProtectedProbeController {
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me() {
    return { ok: true };
  }
}

describe('Auth token refresh flow (E2E)', () => {
  let app: INestApplication;
  let tokens: AuthTokenService;
  let cache: Keyv;
  const jwt = new JwtService();

  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.REFRESH_TOKEN_SECRET = REFRESH_TOKEN_SECRET;
    cache = new Keyv();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PassportModule,
        JwtModule.register({}),
      ],
      controllers: [AuthRefreshController, ProtectedProbeController],
      providers: [
        AuthTokenService,
        JwtStrategy,
        PermissionsService,
        { provide: CACHE_MANAGER, useValue: cache },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(async ({ where }: any) =>
                where.id === user.id ? user : null,
              ),
            },
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn(async () => ({
              sessionAccessTtlSeconds: 900,
              sessionTtlSeconds: 3600,
            })),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    tokens = moduleRef.get(AuthTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cache.clear();
  });

  it('rotates a valid refresh token and returns a new usable pair', async () => {
    const issued = await tokens.issueTokenPair(user);

    const res = await refresh(issued.refreshToken).expect(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).not.toBe(issued.refreshToken);

    // New access token works on a protected route
    await request(app.getHttpServer())
      .get('/probe/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);

    // And the rotated refresh token can itself be rotated
    await refresh(res.body.refreshToken).expect(200);
  });

  it('detects reuse of a rotated-out token: 401 and revokes the whole family', async () => {
    const issued = await tokens.issueTokenPair(user);
    const rotated = await refresh(issued.refreshToken).expect(200);

    // Replay the old (rotated-out) token → theft signal
    await refresh(issued.refreshToken).expect(401);

    // The whole family is revoked: even the latest token no longer works
    await refresh(rotated.body.refreshToken).expect(401);
    expect(await cache.get(tokens.refreshCacheKey(user.walletAddress))).toBeUndefined();
  });

  it('rejects an expired refresh token with 401', async () => {
    await tokens.issueTokenPair(user);
    const expired = jwt.sign(
      { sub: user.id, fid: 'fam', exp: Math.floor(Date.now() / 1000) - 60 },
      { secret: REFRESH_TOKEN_SECRET },
    );

    const res = await refresh(expired).expect(401);
    expect(JSON.stringify(res.body)).toMatch(/expired/i);
  });

  it('rejects a revoked/blacklisted session', async () => {
    const sessionId = 'session-123';
    const issued = await tokens.issueTokenPair(user, sessionId);

    // Access token works before the session is revoked
    await request(app.getHttpServer())
      .get('/probe/me')
      .set('Authorization', `Bearer ${issued.accessToken}`)
      .expect(200);

    // Logout: blacklist the session + revoke the refresh token
    await tokens.blacklistAccessToken(sessionId);
    await tokens.revokeRefreshToken(user.walletAddress);

    await request(app.getHttpServer())
      .get('/probe/me')
      .set('Authorization', `Bearer ${issued.accessToken}`)
      .expect(401);
    await refresh(issued.refreshToken).expect(401);
  });

  it('rejects a missing refresh token with 400', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);
  });
});
