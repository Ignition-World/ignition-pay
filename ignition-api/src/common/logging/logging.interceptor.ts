import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

const REDACTED = '[REDACTED]';
const SLOW_REQUEST_THRESHOLD_MS = 1000;
const MAX_BODY_LOG_BYTES = 10_000;

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'secret',
  'accessToken',
  'refreshToken',
  'privateKey',
  'mnemonic',
  'pin',
  'cvv',
  'cardNumber',
]);

function sanitizeHeaders(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_BODY_KEYS.has(key) ? REDACTED : value;
  }
  return out;
}

function truncateBody(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_BODY_LOG_BYTES) {
    return `[truncated — ${serialized.length} bytes]`;
  }
  return body;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    res.setHeader('x-request-id', requestId);

    const startMs = Date.now();
    const startHr = process.hrtime.bigint();
    const timestamp = new Date().toISOString();

    const { method, url, ip, params, query } = req;
    const userAgent = req.get('user-agent') ?? '-';
    const contentLength = req.get('content-length') ?? '-';

    const baseContext = {
      requestId,
      timestamp,
      method,
      url,
      ip,
      userAgent,
      params,
      query,
      requestContentLength: contentLength,
      requestHeaders: sanitizeHeaders(req.headers),
      requestBody: truncateBody(sanitizeBody(req.body)),
    };

    return next.handle().pipe(
      map((responseBody: unknown) => {
        const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        const { statusCode } = res;
        const responseContentLength = res.get('content-length') ?? '-';

        const isSlowRequest = durationMs >= SLOW_REQUEST_THRESHOLD_MS;

        const logEntry = {
          ...baseContext,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          slow: isSlowRequest,
          responseContentLength,
          responseHeaders: sanitizeHeaders(res.getHeaders()),
          responseBody: truncateBody(sanitizeBody(responseBody)),
          userId: (req as Request & { user?: { id?: string } }).user?.id,
        };

        if (isSlowRequest) {
          this.logger.warn(JSON.stringify(logEntry));
        } else {
          this.logger.log(JSON.stringify(logEntry));
        }

        return responseBody;
      }),
      tap({
        error: (err: { status?: number; message?: string; stack?: string }) => {
          const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
          const statusCode = err?.status ?? 500;

          this.logger.error(
            JSON.stringify({
              ...baseContext,
              statusCode,
              durationMs: Math.round(durationMs * 100) / 100,
              slow: durationMs >= SLOW_REQUEST_THRESHOLD_MS,
              error: err?.message,
              userId: (req as Request & { user?: { id?: string } }).user?.id,
            }),
          );
        },
      }),
    );
  }
}
