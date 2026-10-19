import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { AuthTokenService } from './auth-token.service';
import { AuthVerifyController } from './auth-verify.controller';
import { VerifyDto } from './auth-verify.controller';
import { AuthChallengeService } from './auth-challenge.service';

// We need a real Keypair to test the signature verification path.
import { Keypair } from '@stellar/stellar-sdk';

const TEST_KEYPAIR = Keypair.random();
const TEST_WALLET_SECRET = TEST_KEYPAIR.secret();
const TEST_WALLET_PUBLIC = TEST_KEYPAIR.publicKey();

// Issue #231 — every test must issue a challenge prefixed with the same
// STELLAR_HOME_DOMAIN that AuthVerifyController is configured to expect.
const HOME_DOMAIN = 'ignition-pay.local';

interface PartialVerifyDeps {
  prisma?: jest.Mocked<Pick<PrismaService, 'user' | '$transaction'>>;
  config?: ConfigService;
  challengeService?: jest.Mocked<
    Pick<AuthChallengeService, 'consumeChallenge'>
  >;
  sessionService?: jest.Mocked<Pick<SessionService, 'createSession'>>;
  tokenService?: jest.Mocked<Pick<AuthTokenService, 'issueTokenPair'>>;
}

function makeController(overrides: PartialVerifyDeps = {}): {
  controller: AuthVerifyController;
  prisma: any;
  challengeService: any;
  sessionService: any;
  tokenService: any;
} {
  const upsertMock = jest.fn().mockResolvedValue({
    id: 'user-1',
    walletAddress: TEST_WALLET_PUBLIC,
    role: 'USER',
  });
  // Issue #130: upsert is now executed inside prisma.$transaction
  const prisma = {
    user: { upsert: upsertMock },
    $transaction: jest
      .fn()
      .mockImplementation((fn: (tx: any) => Promise<any>) =>
        fn({ user: { upsert: upsertMock } }),
      ),
  };
  const config = new ConfigService({
    ADMIN_WALLETS: '',
    JWT_SECRET: 'test-secret',
    REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    // Issue #231 — STELLAR_HOME_DOMAIN is the verified prefix.
    STELLAR_HOME_DOMAIN: HOME_DOMAIN,
  });
  const challengeService = {
    consumeChallenge: jest.fn().mockResolvedValue(undefined),
  };
  const sessionService = {
    createSession: jest.fn().mockResolvedValue({
      sessionId: 'sess-1',
      userId: 'user-1',
      walletAddress: TEST_WALLET_PUBLIC,
      role: 'USER',
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000,
      lastSeenAt: Date.now(),
    }),
  };
  const tokenService = {
    issueTokenPair: jest.fn().mockResolvedValue({
      accessToken: 'access-xyz',
      refreshToken: 'refresh-xyz',
      tokenType: 'Bearer' as const,
    }),
  };

  const controller = new AuthVerifyController(
    (overrides.prisma ?? prisma) as unknown as PrismaService,
    overrides.config ?? config,
    (overrides.challengeService ??
      challengeService) as unknown as AuthChallengeService,
    (overrides.sessionService ?? sessionService) as unknown as SessionService,
    (overrides.tokenService ?? tokenService) as unknown as AuthTokenService,
  );

  return { controller, prisma, challengeService, sessionService, tokenService };
}

function signChallenge(challenge: string): string {
  const keypair = Keypair.fromSecret(TEST_WALLET_SECRET);
  return keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');
}

function buildChallenge(nonce = 'nonce', ts = '1700000000'): string {
  // Issue #231 — challenge MUST begin with configured home-domain.
  return `${HOME_DOMAIN}:login:${nonce}:${ts}`;
}

describe('AuthVerifyController', () => {
  describe('verify', () => {
    it('rejects an invalid Stellar wallet address', async () => {
      const { controller } = makeController();
      const dto: VerifyDto = {
        walletAddress: 'NOT-A-VALID-ADDRESS',
        signedChallenge: 'sig',
        challenge: buildChallenge(),
      };

      await expect(controller.verify(dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects when signedChallenge or challenge is missing', async () => {
      const { controller } = makeController();
      await expect(
        controller.verify({
          walletAddress: TEST_WALLET_PUBLIC,
          signedChallenge: '',
          challenge: buildChallenge(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    // ────────────────────────────────────────────────────────────────────
    // Issue #231 — challenges whose prefix does not match the configured
    // STELLAR_HOME_DOMAIN must be rejected BEFORE the (CPU-heavy) Ed25519
    // signature verification runs.
    // ────────────────────────────────────────────────────────────────────

    it('rejects a challenge issued by a different home domain (#231)', async () => {
      const { controller } = makeController();
      const wrongDomainChallenge = `staging.${HOME_DOMAIN}:login:nonce:1700000000`;

      await expect(
        controller.verify({
          walletAddress: TEST_WALLET_PUBLIC,
          signedChallenge: Buffer.from('sig').toString('base64'),
          challenge: wrongDomainChallenge,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a challenge with the old hardcoded `stellaraid:` prefix (#231)', async () => {
      const { controller } = makeController();
      const legacyChallenge = `stellaraid:login:nonce:1700000000`;

      await expect(
        controller.verify({
          walletAddress: TEST_WALLET_PUBLIC,
          signedChallenge: Buffer.from('sig').toString('base64'),
          challenge: legacyChallenge,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a challenge whose `login` segment is missing (#231)', async () => {
      const { controller } = makeController();
      const malformed = `${HOME_DOMAIN}:nologin:nonce:1700000000`;

      await expect(
        controller.verify({
          walletAddress: TEST_WALLET_PUBLIC,
          signedChallenge: Buffer.from('sig').toString('base64'),
          challenge: malformed,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the Ed25519 signature does not match', async () => {
      const { controller } = makeController();
      await expect(
        controller.verify({
          walletAddress: TEST_WALLET_PUBLIC,
          signedChallenge: Buffer.from('wrong-sig').toString('base64'),
          challenge: buildChallenge(),
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('upserts the user atomically in a transaction, opens a session, and mints a token pair (Issues #110, #130)', async () => {
      const challenge = buildChallenge();
      const signedChallenge = signChallenge(challenge);

      const { controller, prisma, sessionService, tokenService } =
        makeController();
      const result = await controller.verify({
        walletAddress: TEST_WALLET_PUBLIC,
        signedChallenge,
        challenge,
      });

      // 1. User upsert was wrapped in a transaction (Issue #130)
      expect(prisma.$transaction).toHaveBeenCalled();

      // 2. Upserted the user from the wallet address inside the transaction
      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { walletAddress: TEST_WALLET_PUBLIC },
          create: expect.objectContaining({
            walletAddress: TEST_WALLET_PUBLIC,
          }),
        }),
      );

      // 3. Opened a tracked session in Redis
      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          walletAddress: TEST_WALLET_PUBLIC,
          role: expect.any(String),
        }),
      );

      // 4. Minted access + refresh tokens with the new session id
      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          walletAddress: TEST_WALLET_PUBLIC,
        }),
        'sess-1',
      );

      // 5. Returned the tokens
      expect(result).toEqual({
        accessToken: 'access-xyz',
        refreshToken: 'refresh-xyz',
        tokenType: 'Bearer',
      });
    });
  });
});
