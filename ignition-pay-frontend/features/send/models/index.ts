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

/** Fee charged per operation, in XLM. */
export const NETWORK_FEE_XLM = 0.00001

/** Amount of `asset` the sender can actually send, after reserves and fees. */
export function spendableBalance(asset: SendableAsset): number {
  const reserved = asset.reserved ?? 0
  const feeAllowance = asset.issuer === 'native' ? NETWORK_FEE_XLM : 0

  return Math.max(0, asset.balance - reserved - feeAllowance)
}

export interface AmountValidationResult {
  isValid: boolean
  error?: string
}

/** Stellar amounts carry at most 7 decimal places. */
export const MAX_DECIMAL_PLACES = 7

export function validateAmount(value: string, asset: SendableAsset): AmountValidationResult {
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

  const spendable = spendableBalance(asset)
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
