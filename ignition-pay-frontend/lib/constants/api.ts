export const API_BASE_URLS = {
  development: 'http://localhost:3000',
  staging: 'https://staging-api.ignitionpay.com',
  production: 'https://api.ignitionpay.com',
} as const;

export type Environment = keyof typeof API_BASE_URLS;

export const API_PREFIX = '/api/v1';

export const API_ENDPOINTS = {
  auth: {
    challenge: '/auth/challenge',
    verify: '/auth/verify',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    sessions: '/auth/sessions',
    sessionById: (id: string) => `/auth/sessions/${id}`,
  },
  users: {
    register: '/users/register',
    confirmEmail: '/users/confirm-email',
    login: '/users/login',
    me: '/users/me',
    profile: '/users/profile',
    password: {
      setup: '/users/password/setup',
      change: '/users/password',
    },
    byWalletAddress: (walletAddress: string) => `/users/${walletAddress}`,
  },
  admin: {
    users: {
      kyc: (id: string) => `/admin/users/${id}/kyc`,
      role: (id: string) => `/admin/users/${id}/role`,
    },
  },
  wallets: {
    root: '/wallets',
    balance: (id: string) => `/wallets/${id}/balance`,
  },
  campaigns: {
    root: '/campaigns',
    byId: (id: string) => `/campaigns/${id}`,
  },
  transactions: {
    root: '/transactions',
  },
  addresses: {
    root: '/addresses',
    byId: (id: string) => `/addresses/${id}`,
    byWallet: (walletId: string) => `/addresses/wallet/${walletId}`,
    generate: '/addresses/generate',
  },
  apiKeys: {
    root: '/api-keys',
    byId: (id: string) => `/api-keys/${id}`,
    rotate: (id: string) => `/api-keys/${id}/rotate`,
    rotateFinalize: (id: string) => `/api-keys/${id}/rotate/finalize`,
    rotateCancel: (id: string) => `/api-keys/${id}/rotate/cancel`,
  },
  sep24: {
    initiate: '/sep24/initiate',
    status: '/sep24/status',
    transaction: (id: string) => `/sep24/transactions/${id}`,
    history: '/sep24/history',
  },
  sep38: {
    quote: '/sep38/quote',
  },
  health: {
    root: '/health',
    ready: '/health/ready',
  },
} as const;

export const TIMEOUT = {
  default: 30_000,
  upload: 120_000,
  longRunning: 300_000,
} as const;

export const RETRY = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  backoffFactor: 2,
} as const;

export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
} as const;
