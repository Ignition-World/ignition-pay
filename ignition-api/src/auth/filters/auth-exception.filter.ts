import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';

import { AuthErrorResponseDto } from '../../common/dto/error-response.dto';

/**
 * Normalises error responses emitted by `/auth/*` endpoints plus
 * `POST /users/login` into a single canonical shape:
 *
 *   { statusCode, error, message, retryAfterSeconds? }
 *
 * Applied via `@UseFilters(AuthExceptionFilter)` (not registered
 * globally) so other endpoints can keep their existing shape — only
 * the auth surface is affected.
 *
 * Resolves Issue #229: auth-verify / auth-token / auth-refresh used
 * to return three different error envelopes; this filter unifies them.
 */
@Catch(BadRequestException, UnauthorizedException, ServiceUnavailableException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    const { message, retryAfterSeconds } = AuthExceptionFilter.extract(body);

    const payload: AuthErrorResponseDto = {
      statusCode: status,
      error: AuthExceptionFilter.errorNameForStatus(status),
      message,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };

    response.status(status).json(payload);
  }

  private static extract(body: string | object): {
    message: string | string[];
    retryAfterSeconds?: number;
  } {
    if (typeof body === 'string') {
      return { message: body };
    }

    const obj = body as {
      message?: unknown;
      retryAfterSeconds?: unknown;
    };

    let message: string | string[];
    if (Array.isArray(obj?.message)) {
      message = (obj.message as unknown[]).map(String);
    } else if (typeof obj?.message === 'string') {
      message = obj.message;
    } else {
      message = 'Bad Request';
    }

    const retryAfterSeconds =
      typeof obj?.retryAfterSeconds === 'number' && obj.retryAfterSeconds >= 0
        ? obj.retryAfterSeconds
        : undefined;

    return { message, retryAfterSeconds };
  }

  private static errorNameForStatus(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 503:
        return 'Service Unavailable';
      default:
        return 'Error';
    }
  }
}
