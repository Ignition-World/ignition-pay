export const EMAIL_JOB_SEND_VERIFICATION = 'send-verification';
export const EMAIL_JOB_SEND_NOTIFICATION = 'send-notification';

export interface SendVerificationEmailPayload {
  to: string;
  token: string;
  userId: string;
}

export interface SendNotificationEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export const CONTRACT_EVENT_JOB_PROCESS = 'process';

export interface ContractEventPayload {
  contractId: string;
  eventType: string;
  txHash?: string;
  ledger?: number;
  data?: Record<string, unknown>;
}

export const ANALYTICS_JOB_TRACK = 'track';

export interface AnalyticsEventPayload {
  event: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

export const PAYMENT_JOB_PROCESS = 'process-payment';

export interface PaymentJobPayload {
  /** Persisted Transaction.id — the processor resolves this to a Stellar tx */
  transactionId: string;
  senderWalletId: string;
  recipientAddress: string;
  amount: string;
  assetCode: string;
}
// ---------------------------------------------------------------------------
// Horizon polling worker — Issue #243
// ---------------------------------------------------------------------------

/** Job name: poll a single transaction hash against Horizon */
export const HORIZON_JOB_CHECK_TX = 'check-tx';

/** Payload for a Horizon check-tx job */
export interface HorizonCheckTxPayload {
  /** Internal Transaction.id (UUID) */
  transactionId: string;
  /** Stellar transaction hash already recorded, or the account to watch */
  stellarTxHash?: string;
}
// Milestone notifications
// ---------------------------------------------------------------------------

export const MILESTONE_JOB_COMPLETED = 'milestone-completed';
export const MILESTONE_JOB_CAMPAIGN_COMPLETED = 'campaign-completed';

export interface MilestoneCompletedPayload {
  /** The campaign creator's user id – recipient of the notification */
  creatorId: string;
  creatorEmail: string;
  campaignId: string;
  campaignTitle: string;
  milestoneId: string;
  milestoneTitle: string;
}

export interface CampaignCompletedPayload {
  creatorId: string;
  creatorEmail: string;
  campaignId: string;
  campaignTitle: string;
}
// ---------------------------------------------------------------------------
// Dashboard cache warming — Issue #591
// ---------------------------------------------------------------------------

/** Job name: warm the cached dashboard payload for a single user */
export const DASHBOARD_JOB_WARM = 'warm-dashboard';

/** Job name: invalidate the cached dashboard payload for a single user */
export const DASHBOARD_JOB_INVALIDATE = 'invalidate-dashboard';

export interface DashboardWarmPayload {
  /** Internal User.id (UUID) */
  userId: string;
}

export interface DashboardInvalidatePayload {
  /** Internal User.id (UUID) */
  userId: string;
}
