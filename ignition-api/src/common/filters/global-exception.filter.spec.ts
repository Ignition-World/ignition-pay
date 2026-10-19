import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { Request, Response } from 'express';
import { GlobalExceptionFilter } from './global-exception.filter';
import { captureException } from '../sentry/sentry.middleware';

jest.mock('../sentry/sentry.middleware', () => ({
  captureException: jest.fn(),
}));

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let mockHost: Partial<ArgumentsHost>;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      url: '/test-route',
      method: 'GET',
      path: '/test-route',
      route: { path: '/test-route' },
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
        getRequest: () => mockRequest as Request,
      }),
    } as unknown as ArgumentsHost;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle HttpException correctly', () => {
    const errorBody = { message: 'Http Exception Error', error: 'Forbidden' };
    const exception = new HttpException(errorBody, HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost as ArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Http Exception Error',
        error: 'Forbidden',
      }),
    );
  });

  it('should handle generic Error correctly and capture to Sentry', () => {
    const exception = new Error('Generic database error');

    filter.catch(exception, mockHost as ArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Generic database error',
        error: 'Internal Server Error',
      }),
    );
    expect(captureException).toHaveBeenCalledWith(exception, {
      route: '/test-route',
      method: 'GET',
    });
  });
});
