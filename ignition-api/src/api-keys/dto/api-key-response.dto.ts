import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Scopes an API key can hold. `ApiKeyScopeGuard` compares them with the
 * precedence admin > write > read, so a higher scope satisfies a lower
 * requirement on any route.
 */
export const API_KEY_SCOPES = ['read', 'write', 'admin'] as const;

/**
 * Lifecycle state derived in `ApiKeysController.toSummary`:
 * `revoked` (isActive false), `rotating` (an active old key still inside its
 * grace period), otherwise `active`.
 */
export const API_KEY_STATUSES = ['active', 'rotating', 'revoked'] as const;

/**
 * Response of `POST /api-keys` and `POST /api-keys/:id/rotate`.
 *
 * `key` is the only time the raw secret is ever returned: the database stores
 * a SHA-256 digest (`keyHash`) and a short `prefix`, so a lost key cannot be
 * recovered and must be rotated instead.
 */
export class CreateApiKeyResponseDto {
  @ApiProperty({ description: 'API key id.', example: '5c8f1a20-7d3e-4b91-8c62-1a0d9e7f4b33' })
  id: string;

  @ApiProperty({
    description:
      'The raw key, shown exactly once. Store it now — only a SHA-256 digest is persisted. ' +
      'Send it as the `X-API-Key` header on API-key protected routes.',
    example: 'sk_9f2c1a4b7d3e5f6081a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f7081',
  })
  key: string;

  @ApiProperty({
    description: 'First 12 characters of the key, stored in clear for display.',
    example: 'sk_9f2c1a4b',
  })
  prefix: string;

  @ApiProperty({
    description: 'Scope granted to the new key. New keys are created with `read`.',
    enum: API_KEY_SCOPES,
    example: 'read',
  })
  scope: string;

  @ApiProperty({
    description: 'Creation timestamp.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description:
      'Present on rotate only — when the previous key stops being accepted.',
    type: String,
    format: 'date-time',
    example: '2026-01-22T10:00:00.000Z',
  })
  rotationExpiresAt?: Date;

  @ApiPropertyOptional({
    description: 'Present on rotate only — follow-up instructions.',
    example:
      'Old key remains active for 7 days. Use POST /api-keys/:id/rotate/finalize to complete rotation early, or POST /api-keys/:id/rotate/cancel to cancel.',
  })
  message?: string;
}

/**
 * Response entry of `GET /api-keys` and `GET /api-keys/admin/users/:userId`,
 * and of `PATCH /api-keys/:id`. Never contains the raw key.
 */
export class ApiKeySummaryDto {
  @ApiProperty({ description: 'API key id.', example: '5c8f1a20-7d3e-4b91-8c62-1a0d9e7f4b33' })
  id: string;

  @ApiProperty({ description: 'Human-readable label.', example: 'Settlement service' })
  name: string;

  @ApiProperty({
    description: 'First 12 characters of the key.',
    example: 'sk_9f2c1a4b',
  })
  prefix: string;

  @ApiProperty({
    description: 'Scope granted to the key.',
    enum: API_KEY_SCOPES,
    example: 'read',
  })
  scope: string;

  @ApiProperty({
    description: 'Whether the key is currently accepted. False after revocation or expiry.',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Lifecycle state derived from isActive and the rotation grace period.',
    enum: API_KEY_STATUSES,
    example: 'active',
  })
  status: string;

  @ApiProperty({
    description: 'Creation timestamp.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last modification timestamp.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Last time the key authenticated a request.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T12:30:00.000Z',
    nullable: true,
    required: false,
  })
  lastUsedAt?: Date | null;

  @ApiProperty({
    description: 'Scheduled expiry, if any.',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  expiresAt?: Date | null;

  @ApiProperty({
    description: 'Set on the old key while it is being rotated; points at its replacement.',
    nullable: true,
    required: false,
  })
  rotationOfId?: string | null;

  @ApiProperty({
    description: 'When the rotation grace period ends and the old key stops being accepted.',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  rotationExpiresAt?: Date | null;
}

export class ApiKeyListResponseDto {
  @ApiProperty({ type: [ApiKeySummaryDto], description: 'The caller\u2019s API keys, newest first.' })
  apiKeys: ApiKeySummaryDto[];
}

export class ApiKeyUserListResponseDto extends ApiKeyListResponseDto {
  @ApiProperty({ description: 'Owner of the returned keys.', example: '3a1b6c9e-6d21-4a3e-8f77-9d2c1f0a5b84' })
  userId: string;
}

/**
 * Error body for the `/api-keys` routes. These routes are JWT protected, so the
 * failures come from `GlobalExceptionFilter` (registered as `APP_FILTER` in
 * `app.module.ts`), which emits
 * `{ statusCode, timestamp, path, message, error }`. `ValidationExceptionFilter`
 * additionally normalises body-validation failures to
 * `{ statusCode, error, message: string[] }` with no `timestamp` / `path`.
 */
export class ApiKeyErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'Unauthorized' })
  error: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Unauthorized',
  })
  message: string | string[];

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:00.000Z',
    required: false,
  })
  timestamp?: string;

  @ApiProperty({ example: '/api-keys', required: false })
  path?: string;
}

/** Response of `POST /api-keys/:id/rotate/finalize`. */
export class FinalizeRotationResponseDto {
  @ApiProperty({ example: 'Rotation finalized. Old key has been revoked.' })
  message: string;

  @ApiProperty({ example: '5c8f1a20-7d3e-4b91-8c62-1a0d9e7f4b33' })
  newKeyId: string;
}

/** Simple `{ message }` acknowledgement. */
export class MessageResponseDto {
  @ApiProperty({ example: 'API key revoked successfully' })
  message: string;
}
