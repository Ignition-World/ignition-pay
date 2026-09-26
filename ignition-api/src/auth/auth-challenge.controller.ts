import { Controller, Get, Query, UseFilters } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { ChallengeQueryDto } from './dto/challenge-query.dto';
import { AuthChallengeService } from './auth-challenge.service';
import { AuthExceptionFilter } from './filters/auth-exception.filter';
import { AuthErrorResponseDto } from '../common/dto/error-response.dto';

/**
 * Issue #225 — the challenge response now includes `expiresAt` so clients
 * can schedule a proactive refresh before the TTL elapses.
 */
class ChallengeResponse {
  @ApiProperty({ example: 'ignition-pay.local:login:abc123:1700000000' })
  challenge: string;

  @ApiProperty({
    example: '2024-01-15T12:05:00.000Z',
    description: 'ISO-8601 timestamp when this challenge expires',
  })
  expiresAt: string;
}

@ApiTags('auth')
@Controller('auth')
@UseFilters(AuthExceptionFilter)
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
export class AuthChallengeController {
  constructor(private readonly challengeService: AuthChallengeService) {}

  /**
   * Issue a new SEP-10 challenge for the given wallet address.
   *
   * Returns the challenge text and its `expiresAt` ISO-8601 timestamp.
   * Clients SHOULD schedule a call to GET /auth/challenge/refresh before
   * the challenge expires to avoid a mid-flow rejection on slow networks.
   *
   * Issue #401 — The challenge endpoint is unauthenticated, so we apply a
   * stricter per-IP throttle (3 requests / 60 s) to prevent brute-force
   * enumeration of wallet addresses and exhaustion of signing capacity.
   */
  @Get('challenge')
  @Throttle({ strict: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get authentication challenge for wallet address' })
  @ApiResponse({ status: 200, description: 'Returns challenge string' })
  @ApiResponse({
    status: 400,
    description: 'Invalid Stellar wallet address',
    type: AuthErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: 'Too many requests — rate limit exceeded' })
  async getChallenge(
    @Query() query: ChallengeQueryDto,
  ): Promise<ChallengeResponse> {
    const { walletAddress } = query;
    return this.challengeService.issueChallenge(walletAddress);
  }

  /**
   * Issue #225 — Refresh the SEP-10 challenge before it expires.
   *
   * If the existing challenge has more than AUTH_CHALLENGE_REFRESH_WINDOW_MS
   * remaining, the current challenge is returned unchanged (no wasted nonce).
   * If it is within the refresh window (or has already expired), a new
   * challenge is transparently minted and the response contains the fresh
   * `challenge` text and updated `expiresAt`.
   *
   * Clients on slow or intermittent networks SHOULD poll this endpoint
   * when they detect they are near the `expiresAt` deadline rather than
   * waiting for a 401 and restarting the flow.
   */
  @Get('challenge/refresh')
  @Throttle({ strict: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Refresh an existing SEP-10 challenge before it expires',
    description:
      'Returns the current challenge unchanged if outside the refresh window, ' +
      'or issues a new one if within AUTH_CHALLENGE_REFRESH_WINDOW_MS of expiry.',
  })
  @ApiResponse({ status: 200, description: 'Returns (possibly refreshed) challenge and expiry', type: ChallengeResponse })
  @ApiResponse({ status: 400, description: 'Invalid Stellar wallet address' })
  @ApiResponse({ status: 429, description: 'Too many requests — rate limit exceeded' })
  async refreshChallenge(
    @Query() query: ChallengeQueryDto,
  ): Promise<ChallengeResponse> {
    const { walletAddress } = query;
    return this.challengeService.refreshChallenge(walletAddress);
  }
}
