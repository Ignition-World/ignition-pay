import {
  Controller,
  Post,
  Body,
  Req,
  HttpStatus,
  HttpCode,
  UseFilters,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthTokenService } from './auth-token.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginResponseDto } from '../users/dto/login.dto';
import { AuthExceptionFilter } from './filters/auth-exception.filter';
import { AuthErrorResponseDto } from '../common/dto/error-response.dto';

@ApiTags('auth')
@Controller('auth')
@UseFilters(AuthExceptionFilter)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthRefreshController {
  private readonly logger = new Logger(AuthRefreshController.name);

  constructor(private readonly tokenService: AuthTokenService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({
    status: 400,
    description: 'refreshToken is required',
    type: AuthErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or revoked token',
    type: AuthErrorResponseDto,
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({
    status: 503,
    description: 'Service temporarily unavailable',
    type: AuthErrorResponseDto,
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    // Issue #406 — Audit logging: record every refresh attempt (success and
    // failure) so incident forensics can trace token-rotation abuse.
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = (req.headers['user-agent'] as string) ?? 'unknown';

    this.logger.log(
      `Refresh token request from ${ip} (${userAgent})`,
    );

    try {
      const result = await this.tokenService.validateAndRotate(dto.refreshToken);

      this.logger.log(
        `Refresh token succeeded for user=${result.user?.id ?? 'unknown'} ` +
          `from ${ip}`,
      );

      return result;
    } catch (err: any) {
      this.logger.warn(
        `Refresh token FAILED from ${ip}: ${err.message}`,
      );
      throw err;
    }
  }
}
