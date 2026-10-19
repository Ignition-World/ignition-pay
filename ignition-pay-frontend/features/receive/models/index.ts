export interface ReceiveAsset {
  code: string
  /** `native` for XLM, otherwise the issuing account. */
  issuer: string
}

/** Assets the Receive page can request, matching the "Assets You Can Receive" list. */
export const RECEIVE_ASSETS: readonly ReceiveAsset[] = [
  { code: 'XLM', issuer: 'native' },
  { code: 'USDC', issuer: 'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A' },
  { code: 'AQUA', issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTGKCYEG5MFWQVMBNXA5W2HAT' },
] as const

/** Stellar amounts allow at most 7 decimal places. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/

/** Returns the amount if it is a positive, well-formed Stellar amount, else undefined. */
export function normalizeReceiveAmount(amount: string | undefined): string | undefined {
  const trimmed = amount?.trim()
  if (!trimmed || !AMOUNT_PATTERN.test(trimmed)) return undefined
  return Number(trimmed) > 0 ? trimmed : undefined
}

export interface PaymentRequest {
  address: string
  /** Selected asset; XLM (native) when omitted. */
  asset?: ReceiveAsset
  amount?: string
  memo?: string
}

/**
 * The string the Receive QR code encodes.
 *
 * With nothing beyond the address selected this is the bare address, which every
 * wallet can scan. As soon as a non-native asset, an amount or a memo is chosen
 * it becomes a SEP-7 `web+stellar:pay` URI carrying them, so the scanning wallet
 * sees the same asset, amount and memo as the page. It is derived purely from
 * the current selection, so it can never reflect a previous one.
 */
export function buildPaymentUri({ address, asset, amount, memo }: PaymentRequest): string {
  if (!address) return ''

  const isNonNative = asset !== undefined && asset.issuer !== 'native'
  const validAmount = normalizeReceiveAmount(amount)
  const trimmedMemo = memo?.trim()

  if (!isNonNative && !validAmount && !trimmedMemo) return address

  const params = new URLSearchParams({ destination: address })
  if (validAmount) params.set('amount', validAmount)
  if (isNonNative) {
    params.set('asset_code', asset.code)
    params.set('asset_issuer', asset.issuer)
  }
  if (trimmedMemo) {
    params.set('memo', trimmedMemo)
    params.set('memo_type', 'MEMO_TEXT')
  }
  return `web+stellar:pay?${params.toString()}`
}
