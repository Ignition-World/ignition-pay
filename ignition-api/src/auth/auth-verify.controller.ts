import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsStellarPublicKey } from '../common/decorators/is-stellar-public-key.decorator';
import { AuthChallengeService } from './auth-challenge.service';
import { buildChallengePrefix, resolveHomeDomain } from './auth-home-domain';
import { SessionService } from '../session/session.service';
import { AuthTokenService } from './auth-token.service';
import { LoginResponseDto } from '../users/dto/login.dto';
import { AuthExceptionFilter } from './filters/auth-exception.filter';
import { AuthErrorResponseDto } from '../common/dto/error-response.dto';

export class VerifyDto {
  @ApiProperty({ example: 'G...wallet-address' })
  @IsString()
  @IsNotEmpty()
  @IsStellarPublicKey()
  walletAddress: string;

  @ApiProperty({ example: 'signature-string' })
  @IsString()
  @IsNotEmpty()
  signedChallenge: string;

  @ApiProperty({
    example: 'ignition-pay.local:login:abcdef1234:1700000000',
    description:
      'Challenge previously issued by /auth/challenge — must be prefixed with the configured STELLAR_HOME_DOMAIN.',
  })
  @IsString()
  @IsNotEmpty()
  challenge: string;
}

export class AuthResponse {
  @ApiProperty({ example: 'eyJhbGci...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGci...' })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer', enum: ['Bearer'] })
  tokenType: 'Bearer';
}

/**
 * POST /auth/verify — Stellar wallet login.
 *
 * Verifies the Ed25519 signature, upserts the user (issues #222 and #225),
 * opens a tracked session, and returns a (access, refresh) token pair
 * minted by AuthTokenService. Issue #110: refresh tokens are issued here
 * so wallet-authenticated users can call /auth/refresh without re-signing.
 *
 * Issue #231 — the submitted challenge must be prefixed with the
 * configured STELLAR_HOME_DOMAIN. This check runs BEFORE the Ed25519
 * signature verification (which is CPU-intensive) so any cross-environment
 * replay attempt or forged prefix short-circuits with a 401 without
 * burning an asymmetric-key pair of CPU time.
 */
@ApiTags('auth')
@Controller('auth')
@UseFilters(AuthExceptionFilter)
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
export class AuthVerifyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly challengeService: AuthChallengeService,
    private readonly sessionService: SessionService,
    private readonly tokenService: AuthTokenService,
  ) {}

  /**
   * Read the active STELLAR_HOME_DOMAIN with the same fallback the
   * challenge-issuer uses so the verify side tracks the issuer side.
   * Delegates to the shared `auth-home-domain` resolver to keep both
   * sites literally identical.
   */
  private getHomeDomain(): string {
    return resolveHomeDomain(this.config);
  }

  /**
   * Issue #231 — fail-fast binding check between the submitted challenge
   * and the configured home domain. Prevents:
   *   - staging-issued challenges being replayed against prod
   *   - cross-org token smuggling (e.g., one Stellar org signing a
   *     challenge for a different one)
   * Throws BadRequestException on empty/wrong-shape challenges and
   * UnauthorizedException on mismatched prefixes (no information leak
   * about the actual issued challenge).
   */
  private assertChallengeHomeDomain(challenge: string): void {
    if (typeof challenge !== 'string' || challenge.length === 0) {
      throw new BadRequestException('Challenge is required');
    }

    const expectedPrefix = buildChallengePrefix(this.getHomeDomain());
    if (!challenge.startsWith(expectedPrefix)) {
      throw new UnauthorizedException(
        'Challenge was not issued by this home domain',
      );
    }
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify signature and issue JWT token' })
  @ApiResponse({
    status: 201,
    description: 'Successful login',
    type: AuthResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid payload',
    type: AuthErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Signature verification failed',
    type: AuthErrorResponseDto,
  })
  async verify(@Body() dto: VerifyDto): Promise<AuthResponse> {
    const { walletAddress, signedChallenge, challenge } = dto;

    if (!walletAddress || !signedChallenge || !challenge) {
      throw new BadRequestException(
        'walletAddress, signedChallenge, and challenge are required',
      );
    }

    if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new BadRequestException('Invalid wallet address');
    }

    // Issue #231 — check the challenge was issued by OUR home domain
    // BEFORE the Ed25519 signature verification, so a malformed/mismatched
    // prefix short-circuits with no asymmetric-key work.
    this.assertChallengeHomeDomain(challenge);

    const keypair = Keypair.fromPublicKey(walletAddress);
    const messageBytes = Buffer.from(challenge, 'utf8');
    const signatureBytes = Buffer.from(signedChallenge, 'base64');

    const valid = keypair.verify(messageBytes, signatureBytes);
    if (!valid) {
      throw new UnauthorizedException('Signature verification failed');
    }

    await this.challengeService.consumeChallenge(walletAddress, challenge);

    // Issue #222: resolve role from admin allowlist
    const adminWallets = this.config
      .get<string>('ADMIN_WALLETS', '')
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    // Validate all admin wallet addresses (extra layer, though already validated at startup)
    for (const wallet of adminWallets) {
      if (!StrKey.isValidEd25519PublicKey(wallet)) {
        throw new Error(
          `Invalid Stellar public key in ADMIN_WALLETS: "${wallet}"`,
        );
      }
    }

    const isAdmin = adminWallets.includes(walletAddress);
    const roleFromAllowlist: UserRole | undefined = isAdmin
      ? UserRole.ADMIN
      : undefined;

    // Issue #225 / #130: upsert user + resolve role atomically in a transaction
    const displayName = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

    const user = await this.prisma.$transaction(async (tx) => {
      return tx.user.upsert({
        where: { walletAddress },
        create: {
          walletAddress,
          displayName,
          role: roleFromAllowlist ?? UserRole.USER,
        },
        update: roleFromAllowlist ? { role: roleFromAllowlist } : {},
      });
    });

    const role = roleFromAllowlist ?? user.role;

    // Issue #110: open a session and mint access + refresh tokens.
    // SessionGuard-authenticated endpoints (e.g. /auth/logout) require
    // the `sid` claim, so we always create a session here.
    const roleValue = String(role);
    const session = await this.sessionService.createSession({
      userId: user.id,
      walletAddress: user.walletAddress ?? '',
      role: roleValue,
    });

    return this.tokenService.issueTokenPair(
      { id: user.id, walletAddress: user.walletAddress, role: roleValue },
      session.sessionId,
    );
  }
}
