export const API_VERSION = {
  prefix: 'v1',
  current: '1.0.0',
} as const;

export const PAGINATION_DEFAULTS = {
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc' as const,
};

export const RATE_LIMIT_DEFAULTS = {
  globalTtl: 60_000,
  globalLimit: 100,
  authTtl: 60_000,
  authLimit: 5,
  apiKeyTtl: 60_000,
  apiKeyLimit: 30,
} as const;

export const RESPONSE_MESSAGES = {
  success: 'Success',
  created: 'Resource created successfully',
  updated: 'Resource updated successfully',
  deleted: 'Resource deleted successfully',
  notFound: 'Resource not found',
  badRequest: 'Invalid request',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  conflict: 'Resource already exists',
  rateLimited: 'Too many requests, please try again later',
  internalError: 'Internal server error',
  serviceUnavailable: 'Service temporarily unavailable',
} as const;
