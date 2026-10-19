import { describe, expect, it, vi } from 'vitest';
import { ErrorCode, ErrorMessage } from '../lib/constants/errors';
import { HttpError, toUserMessage } from '../lib/errorUtils';

/**
 * `toUserMessage` is the single place a thrown value becomes copy shown to a
 * user (issue #896). Before it existed the frontend had two error utilities:
 * `lib/errorUtils.ts` had no message mapping at all, and `utils/errorUtils.ts`
 * prefixed every failure with "Error: ", so a timeout, an expired session, a
 * rate limit and a 500 all looked the same to the person reading the screen.
 *
 * `lib/errorUtils` also imports the Sentry SDK for its capture helpers; the
 * mapping under test is pure, so the SDK is stubbed to keep this suite hermetic.
 */
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
}));

describe('toUserMessage', () => {
  describe('HTTP statuses', () => {
    it('maps every status the API documents to its own message', () => {
      const cases: [number, string][] = [
        [400, ErrorCode.GEN_BAD_REQUEST],
        [401, ErrorCode.AUTH_UNAUTHORIZED],
        [403, ErrorCode.AUTH_UNAUTHORIZED],
        [404, ErrorCode.GEN_NOT_FOUND],
        [409, ErrorCode.GEN_BAD_REQUEST],
        [429, ErrorCode.RATE_LIMIT_EXCEEDED],
        [500, ErrorCode.GEN_INTERNAL_ERROR],
        [503, ErrorCode.GEN_SERVICE_UNAVAILABLE],
      ];

      for (const [status, code] of cases) {
        expect(toUserMessage(new HttpError(status)), `status ${status}`).toBe(
          ErrorMessage[code],
        );
      }
    });

    it('reads a status off a Response-shaped error too', () => {
      expect(toUserMessage({ status: 429 })).toBe(
        ErrorMessage[ErrorCode.RATE_LIMIT_EXCEEDED],
      );
      expect(toUserMessage({ statusCode: 503 })).toBe(
        ErrorMessage[ErrorCode.GEN_SERVICE_UNAVAILABLE],
      );
      expect(toUserMessage({ response: { status: 401 } })).toBe(
        ErrorMessage[ErrorCode.AUTH_UNAUTHORIZED],
      );
    });

    it('ignores a status that is not a real HTTP status', () => {
      expect(toUserMessage({ status: 9000 })).toBe(
        ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR],
      );
      expect(toUserMessage({ status: '429' })).toBe(
        ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR],
      );
    });
  });

  describe('transport failures', () => {
    it('recognises a timeout by name', () => {
      expect(
        toUserMessage(new DOMException('signal timed out', 'TimeoutError')),
      ).toBe(ErrorMessage[ErrorCode.GEN_TIMEOUT]);
      expect(
        toUserMessage(Object.assign(new Error('x'), { name: 'TimeoutError' })),
      ).toBe(ErrorMessage[ErrorCode.GEN_TIMEOUT]);
    });

    it('recognises a timeout by wording', () => {
      expect(toUserMessage(new Error('Request timed out'))).toBe(
        ErrorMessage[ErrorCode.GEN_TIMEOUT],
      );
      expect(toUserMessage('ETIMEDOUT')).toBe(
        ErrorMessage[ErrorCode.GEN_TIMEOUT],
      );
    });

    it('reports a cancelled request as a timeout', () => {
      // A caller-driven abort and `AbortSignal.timeout()` are composed with
      // `AbortSignal.any()` at the fetch call sites, so they cannot be told
      // apart there; both surface as a timeout rather than as the generic text.
      expect(toUserMessage(new DOMException('aborted', 'AbortError'))).toBe(
        ErrorMessage[ErrorCode.GEN_TIMEOUT],
      );
    });

    it('recognises a dropped connection', () => {
      expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(
        ErrorMessage[ErrorCode.GEN_NETWORK_ERROR],
      );
      expect(toUserMessage(new TypeError('fetch failed'))).toBe(
        ErrorMessage[ErrorCode.GEN_NETWORK_ERROR],
      );
      expect(
        toUserMessage(Object.assign(new Error('x'), { name: 'NetworkError' })),
      ).toBe(ErrorMessage[ErrorCode.GEN_NETWORK_ERROR]);
      expect(toUserMessage('getaddrinfo ENOTFOUND api.example.com')).toBe(
        ErrorMessage[ErrorCode.GEN_NETWORK_ERROR],
      );
    });
  });

  describe('application error codes', () => {
    it('prefers the application code over the transport details', () => {
      const error = Object.assign(new Error('401 from /wallets'), {
        code: ErrorCode.AUTH_TOKEN_EXPIRED,
        status: 401,
      });

      // AUTH_TOKEN_EXPIRED, not AUTH_UNAUTHORIZED: the service already decided.
      expect(toUserMessage(error)).toBe(
        ErrorMessage[ErrorCode.AUTH_TOKEN_EXPIRED],
      );
    });

    it('ignores a code the app does not define', () => {
      const error = Object.assign(new Error('boom'), {
        code: 'NOT-A-CODEFROM-THE-APP',
      });

      expect(toUserMessage(error)).toBe(
        ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR],
      );
    });
  });

  describe('distinguishability', () => {
    it('gives timeout, auth expiry, rate limiting and a server error four different strings', () => {
      const messages = [
        toUserMessage(new DOMException('timed out', 'TimeoutError')),
        toUserMessage(new HttpError(401)),
        toUserMessage(new HttpError(429)),
        toUserMessage(new HttpError(500)),
        toUserMessage(new TypeError('Failed to fetch')),
      ];

      expect(new Set(messages).size).toBe(messages.length);
    });
  });

  describe('safety', () => {
    it('never returns raw technical text', () => {
      const message = toUserMessage(
        new Error('kaboom at Object.<anonymous> (/app/lib/db.ts:42:7)'),
      );

      expect(message).toBe(ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR]);
      expect(message).not.toContain('kaboom');
    });

    it('falls back to the generic message for values that are not errors', () => {
      for (const value of [undefined, null, 42, [], {}, Symbol('nope')]) {
        expect(toUserMessage(value)).toBe(
          ErrorMessage[ErrorCode.GEN_INTERNAL_ERROR],
        );
      }
    });

    it('passes an already user-facing message through unchanged', () => {
      // Makes it safe to apply to state a caller may have formatted already.
      for (const message of Object.values(ErrorMessage)) {
        expect(toUserMessage(message)).toBe(message);
      }
    });
  });
});

describe('HttpError', () => {
  it('is an Error that carries the status it was built with', () => {
    const error = new HttpError(429);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(429);
    expect(error.message).toContain('429');
  });

  it('accepts a custom message', () => {
    expect(new HttpError(500, 'Ledger unavailable').message).toBe(
      'Ledger unavailable',
    );
  });
});
