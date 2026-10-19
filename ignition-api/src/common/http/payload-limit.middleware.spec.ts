import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  createPayloadLimitErrorHandler,
  isPayloadTooLargeError,
} from './payload-limit.middleware';
import { BODY_SIZE_LIMIT_METADATA_KEY } from './payload-limits';

/**
 * Issue #622 — oversized bodies must produce a 413 with the API's standard
 * error envelope, and must not leak the parser's limit/length details to the
 * client.
 */
describe('payload limit 413 handling', () => {
  function makeRequest(overrides: Partial<Request> = {}): Request {
    return {
      method: 'POST',
      url: '/sep24/callbacks/circle',
      originalUrl: '/sep24/callbacks/circle',
      route: { handler: () => undefined },
      ...overrides,
    } as unknown as Request;
  }

  function makeResponse() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return {
      status,
      json,
    } as unknown as Response & { status: jest.Mock; json: jest.Mock };
  }

  /** The shape body-parser throws when the body exceeds the resolved limit. */
  function payloadTooLargeError() {
    const error = new Error('request entity too large') as Error & {
      type: string;
      status: number;
      statusCode: number;
      expose: boolean;
      limit: string;
      length: number;
    };
    error.type = 'entity.too.large';
    error.status = HttpStatus.PAYLOAD_TOO_LARGE;
    error.statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
    error.expose = false;
    error.limit = '1mb';
    error.length = 5_000_000;
    return error;
  }

  describe('isPayloadTooLargeError', () => {
    it('recognises the body-parser 413 error', () => {
      expect(isPayloadTooLargeError(payloadTooLargeError())).toBe(true);
    });

    it('recognises a 413 without a type (older body-parser)', () => {
      const error = Object.assign(new Error('too large'), { status: 413 });
      expect(isPayloadTooLargeError(error)).toBe(true);
    });

    it('rejects unrelated errors', () => {
      expect(isPayloadTooLargeError(new Error('boom'))).toBe(false);
      expect(isPayloadTooLargeError(undefined)).toBe(false);
      expect(isPayloadTooLargeError('nope')).toBe(false);
      const teapot = Object.assign(new Error('teapot'), { status: 418 });
      expect(isPayloadTooLargeError(teapot)).toBe(false);
    });
  });

  describe('createPayloadLimitErrorHandler', () => {
    it('is registered as an express error handler (arity 4)', () => {
      expect(createPayloadLimitErrorHandler().length).toBe(4);
    });

    it('responds 413 with the standard error envelope', () => {
      const response = makeResponse();
      const next = jest.fn() as unknown as NextFunction;

      createPayloadLimitErrorHandler()(
        payloadTooLargeError(),
        makeRequest(),
        response,
        next,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          error: 'Payload Too Large',
          message: 'Request payload too large',
          path: '/sep24/callbacks/circle',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('does not leak the configured limit or content length to the client', () => {
      const response = makeResponse();

      createPayloadLimitErrorHandler()(
        payloadTooLargeError(),
        makeRequest(),
        response,
        jest.fn() as unknown as NextFunction,
      );

      const body = response.json.mock.calls[0][0] as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('entity.too.large');
      expect(body).not.toHaveProperty('limit');
      expect(body).not.toHaveProperty('length');
      expect(body).not.toHaveProperty('stack');
    });

    it('delegates non-413 errors to next() untouched', () => {
      const response = makeResponse();
      const next = jest.fn() as unknown as NextFunction;
      const boom = new Error('boom');

      createPayloadLimitErrorHandler()(boom, makeRequest(), response, next);

      expect(next).toHaveBeenCalledWith(boom);
      expect(response.status).not.toHaveBeenCalled();
    });

    it('delegates to next() when the response already started', () => {
      const response = makeResponse();
      (response as unknown as { headersSent: boolean }).headersSent = true;
      const next = jest.fn() as unknown as NextFunction;
      const error = payloadTooLargeError();

      createPayloadLimitErrorHandler()(error, makeRequest(), response, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(response.status).not.toHaveBeenCalled();
    });

    it('reads the route limit from handler metadata for the log line only', () => {
      const handler = () => undefined;
      Reflect.defineMetadata(BODY_SIZE_LIMIT_METADATA_KEY, '10mb', handler);
      const response = makeResponse();

      createPayloadLimitErrorHandler()(
        payloadTooLargeError(),
        makeRequest({ route: { handler } as unknown as Request['route'] }),
        response,
        jest.fn() as unknown as NextFunction,
      );

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    });
  });
});
