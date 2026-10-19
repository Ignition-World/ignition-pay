import {
  BadRequestException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';

import { AuthExceptionFilter } from './auth-exception.filter';

function makeHost(): {
  host: ArgumentsHost;
  res: { status: jest.Mock; json: jest.Mock };
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json };
  const host = {
    switchToHttp: () => ({ getResponse: () => res as unknown as Response }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AuthExceptionFilter (Issue #229)', () => {
  let filter: AuthExceptionFilter;

  beforeEach(() => {
    filter = new AuthExceptionFilter();
  });

  it('normalises a string UnauthorizedException', () => {
    const { host, res } = makeHost();
    filter.catch(new UnauthorizedException('Invalid refresh token'), host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid refresh token',
    });
  });

  it('normalises a structured UnauthorizedException carrying retryAfterSeconds', () => {
    const { host, res } = makeHost();
    filter.catch(
      new UnauthorizedException({
        message: 'Account locked. Try again in 900s',
        retryAfterSeconds: 900,
      }),
      host,
    );
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Account locked. Try again in 900s',
      retryAfterSeconds: 900,
    });
  });

  it('normalises a string BadRequestException', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException('Invalid wallet address'), host);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid wallet address',
    });
  });

  it('normalises an array-message BadRequestException', () => {
    const { host, res } = makeHost();
    filter.catch(
      new BadRequestException({
        message: ['field a invalid', 'field b invalid'],
      }),
      host,
    );
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: ['field a invalid', 'field b invalid'],
    });
  });

  it('normalises a ServiceUnavailableException', () => {
    const { host, res } = makeHost();
    filter.catch(
      new ServiceUnavailableException('Service temporarily unavailable'),
      host,
    );
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Service temporarily unavailable',
    });
  });

  it('omits retryAfterSeconds when it is invalid', () => {
    const { host, res } = makeHost();
    filter.catch(
      new UnauthorizedException({
        message: 'Account locked',
        retryAfterSeconds: -1,
      }),
      host,
    );
    const body = res.json.mock.calls[0][0];
    expect(body).not.toHaveProperty('retryAfterSeconds');
  });
});
