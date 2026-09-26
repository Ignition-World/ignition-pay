import { ApiProperty } from '@nestjs/swagger';

/**
 * Error body returned by `POST /transactions` and `GET /transactions`.
 *
 * Two exception filters are in play and they emit slightly different bodies,
 * so this DTO is the union of the two rather than a shape that is always
 * present:
 *
 * - `GlobalExceptionFilter` (registered as `APP_FILTER` in `app.module.ts`)
 *   emits `{ statusCode, timestamp, path, message, error }` for every
 *   non-validation failure: 401 (missing/invalid `X-API-Key`), 403 (insufficient
 *   key scope), 409, and 500.
 * - `ValidationExceptionFilter` (registered with `useGlobalFilters` in
 *   `main.ts`) normalises every `BadRequestException` — including
 *   class-validator failures on the query/body DTOs — down to
 *   `{ statusCode, error, message: string[] }`, so 400 responses carry a list
 *   of constraint messages and no `timestamp` / `path`.
 *
 * `error` is always the reason phrase for the status code; `message` is the
 * human-readable detail and is the only field callers should branch on.
 */
export class TransactionErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code, repeated in the body for clients that only read the body.',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Reason phrase for `statusCode`.',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({
    description:
      'Human-readable detail. A single string for guard/filter failures, or an array of class-validator constraint messages for a 400.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'amount must be a positive number',
  })
  message: string | string[];

  @ApiProperty({
    description:
      'Emitted by `GlobalExceptionFilter` only; absent on validation (400) responses.',
    type: String,
    format: 'date-time',
    example: '2026-01-15T10:00:00.000Z',
    required: false,
  })
  timestamp?: string;

  @ApiProperty({
    description:
      'Request path echoed by `GlobalExceptionFilter` only; absent on validation (400) responses.',
    example: '/transactions',
    required: false,
  })
  path?: string;
}

/**
 * Response of `GET /transactions/stale/count`.
 */
export class StaleTransactionCountDto {
  @ApiProperty({
    description:
      'Transactions still PENDING beyond STALE_TX_PENDING_TIMEOUT_MINUTES (default 30).',
    example: 2,
  })
  pending: number;

  @ApiProperty({
    description:
      'Transactions still PROCESSING beyond STALE_TX_PROCESSING_TIMEOUT_MINUTES (default 15).',
    example: 1,
  })
  processing: number;
}
