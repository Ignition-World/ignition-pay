export type Sep24Operation = 'deposit' | 'withdraw'

export type Sep24TransactionStatus =
  | 'incomplete'
  | 'pending_user_transfer_start'
  | 'pending_external'
  | 'pending_anchor'
  | 'pending_stellar'
  | 'pending_trust'
  | 'pending_user'
  | 'completed'
  | 'no_market'
  | 'too_small'
  | 'too_large'
  | 'expired'
  | 'error'

export interface InteractiveAnchorInfo {
  name: string
  domain: string
}

export interface Sep24InitiateRequest {
  anchorName: string
  operation: Sep24Operation
  assetCode: string
  assetIssuer?: string
  amount?: number
  stellarAccount: string
}

export interface Sep24InitiateResponse {
  id: string
  anchorTxId: string
  interactiveUrl: string
  status: string
  statusDesc?: string
  moreInfoUrl?: string
  startedAt: string
}

export interface Sep24TransactionStatus {
  id: string
  anchorTxId: string
  status: Sep24TransactionStatus
  statusDesc?: string
  moreInfoUrl?: string
  stellarTxHash?: string
  externalTxId?: string
  message?: string
  amountIn?: string
  amountOut?: string
  feeDetails?: Record<string, unknown>
  startedAt: string
  completedAt?: string
}

export type Sep24WizardStep =
  | 'operation'
  | 'form'
  | 'quote'
  | 'interactive'
  | 'tracking'
  | 'completed'
  | 'error'

export interface Sep24WizardState {
  open: boolean
  anchorName: string
  operation: Sep24Operation | null
  assetCode: string
  assetIssuer?: string
  amount: string
  step: Sep24WizardStep
  transactionId: string | null
  anchorTxId: string | null
  interactiveUrl: string | null
  status: Sep24TransactionStatus | null
  quote: QuoteResponse | null
  error: string | null
  isSubmitting: boolean
}

// ---------------------------------------------------------------------------
// Anchor History
// ---------------------------------------------------------------------------

export interface AnchorHistoryItem {
  id: string
  anchorName: string
  operation: 'deposit' | 'withdraw'
  assetCode: string
  assetIssuer?: string
  amount?: string
  status: string
  statusDesc?: string
  anchorTxId?: string
  stellarTxHash?: string
  moreInfoUrl?: string
  startedAt: string
  completedAt?: string
}

export interface AnchorHistoryResponse {
  items: AnchorHistoryItem[]
  total: number
  page: number
  limit: number
}

export interface AnchorHistoryQuery {
  page?: number
  limit?: number
  operation?: 'deposit' | 'withdraw'
  anchorName?: string
}

// ---------------------------------------------------------------------------
// SEP-38 Quote / RFQ
// ---------------------------------------------------------------------------

export interface QuoteRequest {
  anchorName: string
  sellAsset: string
  buyAsset: string
  sellAmount: number
}

export interface QuoteResponse {
  id: string
  price: string
  totalPrice: string
  sellAmount: string
  buyAmount: string
  sellAsset: string
  buyAsset: string
  fee?: { total: string; asset: string }
  expiresAt: string
  createdAt: string
}
