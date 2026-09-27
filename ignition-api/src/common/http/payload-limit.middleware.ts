import { HttpStatus, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { BODY_SIZE_LIMIT_METADATA_KEY, parseByteLimit } from './payload-limits';

/**
 * Issue #622 — consistent `413 Payload Too Large` for oversized request bodies.
 *
 * The body parsers in `main.ts` are registered with a per-request `limit`
 * function (see `resolveByteLimit()`), so an oversized body makes
 * `express.json()` / `express.urlencoded()` throw `PayloadTooLargeError` from
 * *inside the Express middleware stack* — before Nest's exception layer exists.
 * Nothing catches it today, so the client gets express's default HTML error
 * page with the raw parse error (including the configured limit) appended.
 *
 * This is a plain Express error-handling middleware (arity 4) registered with
 * `app.use()` in `main.ts`. It renders the same envelope
 * `GlobalExceptionFilter` produces, so the client sees a JSON error like any
 * other:
 *
 * ```json
 * {
 *   "statusCode": 413,
 *   "timestamp": "2026-09-26T00:00:00.000Z",
 *   "path": "/sep24/callbacks/circle",
 *   "message": "Request payload too large",
 *   "error": "Payload Too Large"
 * }
 * ```
 *
 * The client-facing message is fixed on purpose. `PayloadTooLargeError.message`
 * and its `limit` / `length` properties expose parser configuration and the
 * declared `Content-Length`; the numbers go to the log line only.
 */

/** Minimal shape of body-parser's `PayloadTooLargeError`. */
interface PayloadTooLargeErrorLike {
  type?: string;
  status?: number;
  statusCode?: number;
  expose?: boolean;
  limit?: string;
  length?: string | number;
}

const logger = new Logger('PayloadLimit');

/**
 * True when `error` is a body-parser "payload too large" failure.
 *
 * body-parser sets `status`/`statusCode` to 413 and `expose: false`; it is not
 * a Nest `HttpException`, so it never reaches `GlobalExceptionFilter`. The
 * `type` check narrows to the two body-parser 413 types so an unrelated error
 * that merely carries a 413 status is still delegated to `next()`.
 */
export function isPayloadTooLargeError(
  error: unknown,
): error is Error & PayloadTooLargeErrorLike {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as PayloadTooLargeErrorLike;
  if (candidate.status !== 413 && candidate.statusCode !== 413) return false;

  return (
    candidate.type === 'entity.too.large' ||
    candidate.type === 'entity.verify.failed' ||
    // Older body-parser releases omit `type`; the 413 status is then the only signal.
    candidate.type === undefined
  );
}

/** Best-effort read of the limit configured for the matched route (logging only). */
function declaredLimitFor(request: Request): string {
  const handler = request.route?.handler;
  const value =
    handler && Reflect.getMetadata(BODY_SIZE_LIMIT_METADATA_KEY, handler);

  if (value === undefined || value === null) return 'default';
  return typeof value === 'number' ? `${value} bytes` : String(value);
}

/** Human-readable byte count for the log line. */
function bytesText(value: string | number | undefined): string {
  const bytes = parseByteLimit(value);
  return bytes === undefined ? 'unknown' : `${bytes} bytes`;
}

/**
 * Build the Express error-handling middleware.
 *
 * Non-413 errors are passed straight to `next()` so express keeps its normal
 * behaviour (and so unrelated middleware errors are unaffected).
 */
export function createPayloadLimitErrorHandler(): (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
) => void {
  // Declared with exactly four parameters: Express only treats `app.use(fn)`
  // as an error handler when `fn.length === 4`.
  return function payloadLimitErrorHandler(
    error: unknown,
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    if (!isPayloadTooLargeError(error)) {
      next(error);
      return;
    }

    // Nothing sensible left to do if the response already started streaming.
    if (response.headersSent) {
      next(error);
      return;
    }

    const tooLarge = error as Error & PayloadTooLargeErrorLike;
    logger.warn(
      `[${request.method} ${request.url}] 413 - body exceeds the ` +
        `${bytesText(tooLarge.limit)} limit (content-length: ` +
        `${bytesText(tooLarge.length)}, route limit: ` +
        `${declaredLimitFor(request)})`,
    );

    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      message: 'Request payload too large',
      error: 'Payload Too Large',
    });
  };
}
