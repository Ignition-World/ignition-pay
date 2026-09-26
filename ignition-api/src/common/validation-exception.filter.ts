import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationError } from 'class-validator';

interface ValidationErrorResponse {
  statusCode: number;
  error: string;
  message: string[];
}

function flattenValidationErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const constraints = error.constraints
      ? Object.values(error.constraints)
      : [];
    const nested = error.children?.length
      ? flattenValidationErrors(error.children)
      : [];
    return [...constraints, ...nested];
  });
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const exceptionResponse = exception.getResponse() as
      | string
      | { message: string | string[] | ValidationError[]; error?: string };

    let messages: string[];

    if (
      typeof exceptionResponse === 'object' &&
      Array.isArray((exceptionResponse as any).message)
    ) {
      const raw = (exceptionResponse as any).message as (
        string | ValidationError
      )[];
      // class-validator errors have a 'constraints' property
      if (
        raw.length > 0 &&
        typeof raw[0] === 'object' &&
        'constraints' in raw[0]
      ) {
        messages = flattenValidationErrors(raw as ValidationError[]);
      } else {
        messages = raw as string[];
      }
    } else if (typeof exceptionResponse === 'string') {
      messages = [exceptionResponse];
    } else {
      const msg = (exceptionResponse as any).message;
      messages = Array.isArray(msg) ? msg : [msg ?? 'Bad Request'];
    }

    const body: ValidationErrorResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: messages,
    };

    response.status(HttpStatus.BAD_REQUEST).json(body);
  }
}
