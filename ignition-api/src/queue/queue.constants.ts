export const QUEUE_EMAIL = 'email';
export const QUEUE_CONTRACT_EVENTS = 'contract-events';
export const QUEUE_ANALYTICS = 'analytics';
export const QUEUE_PAYMENTS = 'payments';
export const QUEUE_HORIZON = 'horizon';
export const QUEUE_DASHBOARD = 'dashboard';
export const QUEUE_DATA_EXPORT = 'data-export';

/**
 * Default dead-letter retry configuration for generic queues.
 */
export const DEFAULT_BACKOFF_SETTINGS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * Email queue retry configuration:
 * Transient SMTP timeouts benefit from exponential backoff with more retries.
 */
export const EMAIL_QUEUE_SETTINGS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * Contract events queue retry configuration:
 * Permanent RPC errors / contract reverts need fewer attempts with a longer fixed backoff
 * to avoid spamming the RPC node.
 */
export const CONTRACT_EVENTS_QUEUE_SETTINGS = {
  attempts: 2,
  backoff: { type: 'fixed', delay: 10000 },
  removeOnComplete: true,
  removeOnFail: false,
};

export const QUEUE_BACKOFF_CONFIGS: Record<string, typeof DEFAULT_BACKOFF_SETTINGS> = {
  [QUEUE_EMAIL]: EMAIL_QUEUE_SETTINGS,
  [QUEUE_CONTRACT_EVENTS]: CONTRACT_EVENTS_QUEUE_SETTINGS,
  default: DEFAULT_BACKOFF_SETTINGS,
};

