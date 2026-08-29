export interface SendableAsset {
  code: string
  /** `native` for XLM, otherwise the issuer's account id. */
  issuer: string
  /** Spendable amount of this asset held by the sender. */
  balance: number
  /**
   * Amount that must stay in the account (base reserve plus per-entry reserve
   * for XLM). Applies to the native asset only.
   */
  reserved?: number
}

/** Stellar base fee per operation in stroops (1 XLM = 10,000,000 stroops). */
export const BASE_FEE_STROOPS = 100
export const STROOPS_PER_XLM = 10_000_000

/** Default fee charged per single-operation transaction, in XLM (100 stroops). */
export const DEFAULT_NETWORK_FEE_XLM = 0.00001

/** Fee charged per operation, in XLM (default fallback). */
export const NETWORK_FEE_XLM = DEFAULT_NETWORK_FEE_XLM

export interface NetworkFeeEstimate {
  feeInXlm: number
  feeInStroops: number
  formattedFee: string
  baseFeeInStroops: number
  operationCount: number
  isDynamic: boolean
  source: 'horizon' | 'fallback'
}

/**
 * Calculates the transaction fee in Stroops, XLM, and human-readable string
 * based on base fee and operation count.
 */
export function calculateTransactionFee(
  baseFeeStroops: number = BASE_FEE_STROOPS,
  operationCount: number = 1,
  source: 'horizon' | 'fallback' = 'fallback',
): NetworkFeeEstimate {
  const safeBaseFee = Math.max(
    BASE_FEE_STROOPS,
    Number.isFinite(baseFeeStroops) ? baseFeeStroops : BASE_FEE_STROOPS,
  )
  const safeOpCount = Math.max(
    1,
    Number.isFinite(operationCount) ? Math.floor(operationCount) : 1,
  )
  const feeInStroops = safeBaseFee * safeOpCount
  const feeInXlm = feeInStroops / STROOPS_PER_XLM
  const formattedFee = `${formatAmount(feeInXlm)} XLM`

  return {
    feeInXlm,
    feeInStroops,
    formattedFee,
    baseFeeInStroops: safeBaseFee,
    operationCount: safeOpCount,
    isDynamic: source === 'horizon',
    source,
  }
}

/** Amount of `asset` the sender can actually send, after reserves and fees. */
export function spendableBalance(asset: SendableAsset, customFee?: number): number {
  const reserved = asset.reserved ?? 0
  const fee = customFee ?? (asset.issuer === 'native' ? NETWORK_FEE_XLM : 0)
  const feeAllowance = asset.issuer === 'native' ? fee : 0

  return Math.max(0, asset.balance - reserved - feeAllowance)
}

export interface AmountValidationResult {
  isValid: boolean
  error?: string
}

/** Stellar amounts carry at most 7 decimal places. */
const MAX_DECIMAL_PLACES = 7

export function validateAmount(
  value: string,
  asset: SendableAsset,
  customFee?: number,
): AmountValidationResult {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return { isValid: false, error: 'Enter an amount to send.' }
  }

  if (!/^\d*\.?\d*$/.test(trimmed)) {
    return { isValid: false, error: 'Amount must be a number.' }
  }

  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { isValid: false, error: 'Amount must be greater than zero.' }
  }

  const decimals = trimmed.split('.')[1]?.length ?? 0
  if (decimals > MAX_DECIMAL_PLACES) {
    return {
      isValid: false,
      error: `Stellar supports up to ${MAX_DECIMAL_PLACES} decimal places.`,
    }
  }

  const spendable = spendableBalance(asset, customFee)
  if (amount > spendable) {
    return {
      isValid: false,
      error: `Amount exceeds your available balance of ${formatAmount(spendable)} ${asset.code}.`,
    }
  }

  return { isValid: true }
}

/** Formats an amount with Stellar's precision, without trailing zeroes. */
export function formatAmount(amount: number): string {
  return Number(amount.toFixed(MAX_DECIMAL_PLACES)).toString()
}
