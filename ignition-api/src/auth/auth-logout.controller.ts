import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { SessionGuard } from '../session/session.guard';
import type { AuthenticatedRequest } from '../session/session.guard';
import { SessionService } from '../session/session.service';
import { AuthTokenService } from './auth-token.service';
import { AuthExceptionFilter } from './filters/auth-exception.filter';
import { AuthErrorResponseDto } from '../common/dto/error-response.dto';

interface LogoutResponse {
  message: string;
}

/**
 * POST /auth/logout — secure token revocation.
 *
 * - Requires a valid access token (SessionGuard).
 * - Revokes the user's session in Redis (SessionService).
 * - Deletes the refresh-token cache entry for the wallet (AuthTokenService),
 *   so any cached or stolen refresh token becomes unusable.
 *
 * Issue #110: this is the secure token revocation on logout requirement.
 */
@ApiTags('auth')
@Controller('auth')
@UseFilters(AuthExceptionFilter)
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
export class AuthLogoutController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly tokenService: AuthTokenService,
  ) {}

  @Post('logout')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout and revoke the current session + refresh token',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session and refresh token successfully revoked',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing access token',
    type: AuthErrorResponseDto,
  })
  async logout(@Req() req: AuthenticatedRequest): Promise<LogoutResponse> {
    if (!req.user) {
      throw new UnauthorizedException('Invalid token');
    }

    const { userId, sessionId, walletAddress } = req.user;

    // Blacklist the access token so JwtAuthGuard-protected endpoints
    // (e.g. GET /users/me) reject it immediately — not just SessionGuard.
    await this.tokenService.blacklistAccessToken(sessionId);

    // Revoke the session so the access token can't be used any more.
    await this.sessionService.revokeSession(userId, sessionId);

    // Invalidate the refresh token in cache so even if it was stolen,
    // it can't be exchanged for a new access token after logout.
    await this.tokenService.revokeRefreshToken(walletAddress);

    return { message: 'Logged out successfully' };
  }
}
