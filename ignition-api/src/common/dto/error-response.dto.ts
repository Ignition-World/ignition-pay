import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical error response shape produced by `AuthExceptionFilter` and
 * returned by every `/auth/*` endpoint, plus `POST /users/login`.
 *
 * All responses use the same envelope so clients can rely on a stable
 * contract regardless of which exception class triggered the response
 * (`BadRequestException`, `UnauthorizedException`, or
 * `ServiceUnavailableException`).
 */
export class AuthErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'Unauthorized' })
  error: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Invalid credentials',
  })
  message: string | string[];

  /**
   * Optional structured hint for clients. Currently used by the
   * account-lockout flow (Issue #232) to surface how long the user
   * must wait before retrying.
   */
  @ApiProperty({ example: 900, required: false, nullable: true })
  retryAfterSeconds?: number;
}
