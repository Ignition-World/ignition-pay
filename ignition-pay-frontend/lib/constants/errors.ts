export const ErrorCode = {
  // Auth errors (AUTH-*)
  AUTH_INVALID_CREDENTIALS: 'AUTH-001',
  AUTH_TOKEN_EXPIRED: 'AUTH-002',
  AUTH_TOKEN_INVALID: 'AUTH-003',
  AUTH_SIGNATURE_FAILED: 'AUTH-004',
  AUTH_CHALLENGE_EXPIRED: 'AUTH-005',
  AUTH_SESSION_REVOKED: 'AUTH-006',
  AUTH_UNAUTHORIZED: 'AUTH-007',

  // User errors (USER-*)
  USER_NOT_FOUND: 'USER-001',
  USER_EMAIL_EXISTS: 'USER-002',
  USER_WALLET_EXISTS: 'USER-003',
  USER_EMAIL_NOT_CONFIRMED: 'USER-004',
  USER_INVALID_ROLE: 'USER-005',

  // Wallet errors (WALLET-*)
  WALLET_NOT_FOUND: 'WALLET-001',
  WALLET_ADDRESS_IN_USE: 'WALLET-002',
  WALLET_INVALID_ADDRESS: 'WALLET-003',

  // Campaign errors (CAMP-*)
  CAMP_NOT_FOUND: 'CAMP-001',
  CAMP_FORBIDDEN_FIELD: 'CAMP-002',
  CAMP_UNAUTHORIZED: 'CAMP-003',

  // Transaction errors (TX-*)
  TX_NOT_FOUND: 'TX-001',
  TX_INVALID_FILTERS: 'TX-002',

  // Address errors (ADDR-*)
  ADDR_NOT_FOUND: 'ADDR-001',
  ADDR_EXISTS: 'ADDR-002',
  ADDR_GENERATION_FAILED: 'ADDR-003',

  // API Key errors (APIKEY-*)
  APIKEY_NOT_FOUND: 'APIKEY-001',
  APIKEY_FORBIDDEN: 'APIKEY-002',
  APIKEY_INVALID: 'APIKEY-003',

  // Rate limiting errors (RATE-*)
  RATE_LIMIT_EXCEEDED: 'RATE-001',

  // General errors (GEN-*)
  GEN_NOT_FOUND: 'GEN-001',
  GEN_BAD_REQUEST: 'GEN-002',
  GEN_INTERNAL_ERROR: 'GEN-003',
  GEN_SERVICE_UNAVAILABLE: 'GEN-004',
  GEN_TIMEOUT: 'GEN-005',
  GEN_NETWORK_ERROR: 'GEN-006',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorMessage: Record<string, string> = {
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password.',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Invalid authentication token.',
  [ErrorCode.AUTH_SIGNATURE_FAILED]: 'Signature verification failed.',
  [ErrorCode.AUTH_CHALLENGE_EXPIRED]: 'Authentication challenge has expired. Please try again.',
  [ErrorCode.AUTH_SESSION_REVOKED]: 'Session has been revoked.',
  [ErrorCode.AUTH_UNAUTHORIZED]: 'You must be signed in to access this resource.',

  [ErrorCode.USER_NOT_FOUND]: 'User not found.',
  [ErrorCode.USER_EMAIL_EXISTS]: 'An account with this email already exists.',
  [ErrorCode.USER_WALLET_EXISTS]: 'An account with this wallet address already exists.',
  [ErrorCode.USER_EMAIL_NOT_CONFIRMED]: 'Please confirm your email before continuing.',
  [ErrorCode.USER_INVALID_ROLE]: 'Invalid user role specified.',

  [ErrorCode.WALLET_NOT_FOUND]: 'Wallet not found.',
  [ErrorCode.WALLET_ADDRESS_IN_USE]: 'This deposit address is already in use.',
  [ErrorCode.WALLET_INVALID_ADDRESS]: 'Invalid wallet address.',

  [ErrorCode.CAMP_NOT_FOUND]: 'Campaign not found.',
  [ErrorCode.CAMP_FORBIDDEN_FIELD]: 'Cannot update protected campaign fields.',
  [ErrorCode.CAMP_UNAUTHORIZED]: 'You are not authorized to modify this campaign.',

  [ErrorCode.TX_NOT_FOUND]: 'Transaction not found.',
  [ErrorCode.TX_INVALID_FILTERS]: 'Invalid transaction filter parameters.',

  [ErrorCode.ADDR_NOT_FOUND]: 'Address not found.',
  [ErrorCode.ADDR_EXISTS]: 'Address already exists.',
  [ErrorCode.ADDR_GENERATION_FAILED]: 'Failed to generate deposit address.',

  [ErrorCode.APIKEY_NOT_FOUND]: 'API key not found.',
  [ErrorCode.APIKEY_FORBIDDEN]: 'You do not own this API key.',
  [ErrorCode.APIKEY_INVALID]: 'Invalid API key.',

  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',

  [ErrorCode.GEN_NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.GEN_BAD_REQUEST]: 'Invalid request. Please check your input.',
  [ErrorCode.GEN_INTERNAL_ERROR]: 'An unexpected error occurred. Please try again.',
  [ErrorCode.GEN_SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
  [ErrorCode.GEN_TIMEOUT]: 'Request timed out. Please try again.',
  [ErrorCode.GEN_NETWORK_ERROR]: 'Network error. Please check your connection.',
};

export const HttpStatusToErrorCode: Record<number, ErrorCodeType> = {
  400: ErrorCode.GEN_BAD_REQUEST,
  401: ErrorCode.AUTH_UNAUTHORIZED,
  403: ErrorCode.AUTH_UNAUTHORIZED,
  404: ErrorCode.GEN_NOT_FOUND,
  409: ErrorCode.GEN_BAD_REQUEST,
  429: ErrorCode.RATE_LIMIT_EXCEEDED,
  500: ErrorCode.GEN_INTERNAL_ERROR,
  503: ErrorCode.GEN_SERVICE_UNAVAILABLE,
};
