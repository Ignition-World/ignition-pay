import { HttpException, HttpStatus } from '@nestjs/common';

export enum Sep24ErrorCode {
  INVALID_ASSET = 'SEP24_INVALID_ASSET',
  KYC_REQUIRED = 'SEP24_KYC_REQUIRED',
  ANCHOR_UNAVAILABLE = 'SEP24_ANCHOR_UNAVAILABLE',
  TRANSACTION_FAILED = 'SEP24_TRANSACTION_FAILED',
}

const ERROR_MAPPINGS: Record<string, { code: Sep24ErrorCode; status: HttpStatus; message: string }> = {
  'asset not supported': {
    code: Sep24ErrorCode.INVALID_ASSET,
    status: HttpStatus.BAD_REQUEST,
    message: 'The requested asset is not supported by the anchor.',
  },
  'kyc needed': {
    code: Sep24ErrorCode.KYC_REQUIRED,
    status: HttpStatus.FORBIDDEN,
    message: 'Additional verification (KYC) is required to proceed with this transfer.',
  },
  'timeout': {
    code: Sep24ErrorCode.ANCHOR_UNAVAILABLE,
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'The anchor service is temporarily unavailable. Please try again later.',
  },
};

export function mapAnchorError(rawError: any): HttpException {
  const errorMessage = (rawError?.message || String(rawError)).toLowerCase();

  for (const [pattern, mapping] of Object.entries(ERROR_MAPPINGS)) {
    if (errorMessage.includes(pattern)) {
      return new HttpException(
        {
          error: mapping.code,
          message: mapping.message,
        },
        mapping.status,
      );
    }
  }

  // Fallback for unmapped raw errors
  return new HttpException(
    {
      error: Sep24ErrorCode.TRANSACTION_FAILED,
      message: 'An unexpected anchor error occurred. Please contact support.',
    },
    HttpStatus.BAD_INTERNAL_SERVER_ERROR || HttpStatus.INTERNAL_SERVER_ERROR,
  );
}