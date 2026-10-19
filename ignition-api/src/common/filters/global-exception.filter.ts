import {
  BadRequestException,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { captureException } from '../sentry/sentry.middleware';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal Server Error';
    let errorResponse: string | object = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
        errorResponse = responseBody;
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        message = (responseBody as any).message || message;
        errorResponse = (responseBody as any).error || message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorPayload = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      error: errorResponse,
    };

    // Log the error
    if (status >= 500) {
      this.logger.error(
        `[${request.method} ${request.url}] ${status} - ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // Capture unexpected errors to Sentry
      captureException(exception, {
        route: request.route?.path || request.path,
        method: request.method,
      });
    } else {
      this.logger.warn(
        `[${request.method} ${request.url}] ${status} - ${message}`,
      );
      // Validation failures are not 5xx, but the stack and field path are needed
      // in error dashboards to find the offending input.
      if (exception instanceof BadRequestException) {
        captureException(exception, {
          route: request.route?.path || request.path,
          method: request.method,
          validation: JSON.stringify(exception.getResponse()),
        });
      }
    }

    response.status(status).json(errorPayload);
  }
}
