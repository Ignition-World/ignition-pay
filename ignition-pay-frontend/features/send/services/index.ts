export * from './fee'
import { API_BASE_URLS, API_ENDPOINTS, API_PREFIX, TIMEOUT } from '@/lib/constants'

export type TrustlineStatus =
  /** Recipient holds a trustline for the asset (or the asset is native). */
  | 'ok'
  /** Recipient exists but has no trustline for this asset — the payment would fail. */
  | 'missing'
  /** Recipient account does not exist yet on the network. */
  | 'unfunded'
  /** The check could not be completed; the user decides whether to continue. */
  | 'unknown'

export interface TrustlineCheck {
  status: TrustlineStatus
  message?: string
}

function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL
  if (configured) return configured.replace(/\/$/, '')

  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  return API_BASE_URLS[environment]
}

interface VerifyAddressResponse {
  exists?: boolean
  balances?: { assetType?: string; assetCode?: string; assetIssuer?: string }[]
}

/**
 * Checks whether `recipient` can receive `assetCode` before the payment is
 * confirmed. Non-native assets require the recipient to have established a
 * trustline first, otherwise the transaction fails on submission.
 *
 * Returns `unknown` rather than throwing: a failed pre-check should warn, not
 * block the user.
 */
export async function checkTrustline(
  recipient: string,
  assetCode: string,
  assetIssuer: string,
  signal?: AbortSignal,
): Promise<TrustlineCheck> {
  if (assetIssuer === 'native' || assetCode === 'XLM') {
    return { status: 'ok' }
  }

  const url = `${apiBaseUrl()}${API_PREFIX}${API_ENDPOINTS.wallets.balance(recipient)}`
  const timeout = AbortSignal.timeout(TIMEOUT.default)
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    const response = await fetch(url, {
      signal: composed,
      headers: { Accept: 'application/json' },
    })

    if (response.status === 404) {
      return {
        status: 'unfunded',
        message:
          'This account does not exist yet on the Stellar network, so it cannot receive this asset.',
      }
    }

    if (!response.ok) {
      return { status: 'unknown', message: 'We could not verify the recipient’s trustlines.' }
    }

    const payload = (await response.json()) as VerifyAddressResponse
    const balances = payload.balances ?? []

    const hasTrustline = balances.some(
      (balance) =>
        balance.assetCode === assetCode &&
        (balance.assetIssuer === undefined || balance.assetIssuer === assetIssuer),
    )

    if (hasTrustline) return { status: 'ok' }

    return {
      status: 'missing',
      message: `The recipient has no ${assetCode} trustline. Ask them to add ${assetCode} before you send it.`,
    }
  } catch {
    if (signal?.aborted) return { status: 'unknown' }
    return { status: 'unknown', message: 'We could not verify the recipient’s trustlines.' }
  }
}
