import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import Keyv from 'keyv';
import { UserRole } from '@prisma/client';

import { LoginResponseDto } from '../users/dto/login.dto';
import { PrismaService } from '../prisma/prisma.service';

// Minimal user shape that AuthTokenService needs to mint/revoke tokens.
// Allows callers (auth-verify.controller, users.service.login) to pass
// in the persisted user without coupling to the full Prisma type.
export interface AuthenticatedUser {
  id: string;
  walletAddress: string | null;
  role: UserRole | string;
}

interface RefreshTokenPayload {
  sub: string;
  sid?: string;
  iat?: number;
  exp?: number;
}

interface AccessTokenPayload {
  sub: string;
  walletAddress: string;
  role: UserRole | string;
  sid?: string;
}

@Injectable()
export class AuthTokenService {
  /** 7 days — refresh-token / session TTL */
  private readonly REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  /** 15 minutes — access-token TTL */
  private readonly ACCESS_TTL = '15m';

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Keyv,
  ) {}

  /**
   * Cache key used to store the *current* refresh token for a wallet user.
   * The token in this slot is rotated on every successful /auth/refresh.
   */
  refreshCacheKey(walletAddress: string): string {
    return `refresh:${walletAddress}`;
  }

  /**
   * Mint a fresh (access, refresh) token pair for a user, write the
   * refresh token into the cache so subsequent /auth/refresh calls can
   * validate + rotate it, and return both tokens.
   *
   * Passing a `sessionId` embeds it as a `sid` claim in the access token
   * so SessionGuard-based endpoints (e.g. /auth/logout) can resolve and
   * revoke the user's session on logout.
   */
  async issueTokenPair(
    user: AuthenticatedUser,
    sessionId?: string,
  ): Promise<LoginResponseDto> {
    const walletAddress = user.walletAddress ?? '';

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      walletAddress,
      role: user.role,
      ...(sessionId ? { sid: sessionId } : {}),
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: this.ACCESS_TTL,
    });

    const refreshPayload: RefreshTokenPayload = sessionId
      ? { sub: user.id, sid: sessionId }
      : { sub: user.id };

    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.get<string>(
        'REFRESH_TOKEN_SECRET',
        'default-refresh-secret',
      ),
      expiresIn: '7d',
    });

    try {
      // Overwrite any prior refresh token — only the latest one is valid.
      await this.cache.set(
        this.refreshCacheKey(walletAddress),
        refreshToken,
        this.REFRESH_TTL_MS,
      );
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  /**
   * Validate a refresh token, rotate it in the cache, and return a brand
   * new (access, refresh) pair. Rejects expired/revoked/mismatched
   * tokens with 401; surfaces Redis / Prisma failures as 503.
   */
  async validateAndRotate(refreshToken: string): Promise<LoginResponseDto> {
    if (!refreshToken || refreshToken.trim() === '') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: RefreshTokenPayload;

    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>(
          'REFRESH_TOKEN_SECRET',
          'default-refresh-secret',
        ),
      }) as RefreshTokenPayload;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        err.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException('Refresh token expired');
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.sub || payload.sub.trim() === '') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const cacheKey = this.refreshCacheKey(user.walletAddress ?? '');
    let storedToken: string | undefined;

    try {
      storedToken = await this.cache.get(cacheKey);
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      walletAddress: user.walletAddress ?? '',
      role: user.role,
    };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: this.config.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: this.ACCESS_TTL,
    });

    const newRefreshToken = this.jwt.sign({ sub: user.id }, {
      secret: this.config.get<string>(
        'REFRESH_TOKEN_SECRET',
        'default-refresh-secret',
      ),
      expiresIn: '7d',
    });

    try {
      await this.cache.delete(cacheKey);
      await this.cache.set(cacheKey, newRefreshToken, this.REFRESH_TTL_MS);
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }

    return { accessToken, refreshToken: newRefreshToken, tokenType: 'Bearer' };
  }

  /**
   * Securely revoke the refresh token for a user. Called by /auth/logout
   * (and any other revoking flow) so that even if the refresh token was
   * stolen, it can never be used again after this call returns.
   */
  async revokeRefreshToken(walletAddress: string | null | undefined): Promise<void> {
    if (!walletAddress) {
      return;
    }
    try {
      await this.cache.delete(this.refreshCacheKey(walletAddress));
    } catch {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
  }
}
