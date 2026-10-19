import { BadRequestException, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { Response } from 'express';
import { ValidationExceptionFilter } from './validation-exception.filter';

describe('ValidationExceptionFilter', () => {
  let filter: ValidationExceptionFilter;

  beforeEach(() => {
    filter = new ValidationExceptionFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should flatten class-validator validation errors', () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;

    const mockValidationError: ValidationError = {
      property: 'email',
      constraints: { isEmail: 'email must be a valid email' },
      children: [
        {
          property: 'nested',
          constraints: { min: 'nested must be greater than 0' },
        },
      ],
    };

    const exception = new BadRequestException({
      message: [mockValidationError],
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: expect.arrayContaining([
          'email must be a valid email',
          'nested must be greater than 0',
        ]),
      }),
    );
  });

  it('should handle simple string messages', () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;

    const exception = new BadRequestException('Simple Error Message');

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['Simple Error Message'],
      }),
    );
  });

  it('should handle non-array messages in object responses', () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;

    const exception = new BadRequestException({
      message: 'Single Object Error',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['Single Object Error'],
      }),
    );
  });
});
