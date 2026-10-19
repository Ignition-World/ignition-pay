import { validateStellarAddress } from './strkey'

export type PaymentRequestParseResult =
  | { ok: true; destination: string; amount?: string; memo?: string }
  | { ok: false; error: string }

/** Stellar amounts: positive, at most 7 decimal places. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/

/**
 * Parse and validate the query parameters of an incoming payment request link
 * (SEP-7 style: `destination`, optional `amount` and `memo`). The destination
 * is checked with the same StrKey validation the send form uses, so a
 * malformed or hostile link yields a friendly message instead of reaching the
 * API. Returns `null` when the link carries no destination at all.
 */
export function parsePaymentRequest(params: URLSearchParams): PaymentRequestParseResult | null {
  const destination = params.get('destination')
  if (destination === null) return null

  const check = validateStellarAddress(destination)
  if (!check.isValid) {
    return {
      ok: false,
      error: `This payment link has an invalid destination. ${check.error ?? ''}`.trim(),
    }
  }

  const rawAmount = params.get('amount')?.trim()
  const amount =
    rawAmount && AMOUNT_PATTERN.test(rawAmount) && Number(rawAmount) > 0 ? rawAmount : undefined
  const memo = params.get('memo')?.trim() || undefined

  return { ok: true, destination: destination.trim(), amount, memo }
}
