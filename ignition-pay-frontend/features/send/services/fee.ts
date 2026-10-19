import { BASE_FEE_STROOPS, calculateTransactionFee, type NetworkFeeEstimate } from '../models'
import { TIMEOUT } from '@/lib/constants'

export interface HorizonFeeStatsResponse {
  last_ledger?: string
  last_ledger_base_fee?: string
  fee_charged?: {
    min?: string
    mode?: string
    p50?: string
    p90?: string
    p95?: string
    p99?: string
  }
}

export interface NetworkFeeStats {
  baseFeeStroops: number
  p50FeeStroops: number
  source: 'horizon' | 'fallback'
}

function horizonBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL
  if (configured) return configured.replace(/\/$/, '')

  return 'https://horizon.stellar.org'
}

/**
 * Fetches dynamic network fee stats from the Stellar Horizon `/fee_stats` endpoint.
 * Falls back to the protocol standard minimum base fee (100 stroops) on failure.
 */
export async function fetchNetworkFeeStats(signal?: AbortSignal): Promise<NetworkFeeStats> {
  const url = `${horizonBaseUrl()}/fee_stats`
  const timeout = AbortSignal.timeout(TIMEOUT.default)
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    const response = await fetch(url, {
      signal: composed,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return {
        baseFeeStroops: BASE_FEE_STROOPS,
        p50FeeStroops: BASE_FEE_STROOPS,
        source: 'fallback',
      }
    }

    const payload = (await response.json()) as HorizonFeeStatsResponse
    const lastLedgerBase = payload.last_ledger_base_fee
      ? parseInt(payload.last_ledger_base_fee, 10)
      : BASE_FEE_STROOPS
    const p50 = payload.fee_charged?.p50
      ? parseInt(payload.fee_charged.p50, 10)
      : lastLedgerBase

    const baseFeeStroops =
      Number.isFinite(lastLedgerBase) && lastLedgerBase >= BASE_FEE_STROOPS
        ? lastLedgerBase
        : BASE_FEE_STROOPS

    const p50FeeStroops =
      Number.isFinite(p50) && p50 >= BASE_FEE_STROOPS ? p50 : baseFeeStroops

    return {
      baseFeeStroops,
      p50FeeStroops,
      source: 'horizon',
    }
  } catch {
    return {
      baseFeeStroops: BASE_FEE_STROOPS,
      p50FeeStroops: BASE_FEE_STROOPS,
      source: 'fallback',
    }
  }
}

export interface EstimateTransactionFeeOptions {
  operationCount?: number
  baseFeeStroops?: number
  signal?: AbortSignal
}

/**
 * Estimates transaction fee based on current Stellar network conditions (via Horizon)
 * and transaction complexity (operation count).
 */
export async function estimateTransactionFee(
  options: EstimateTransactionFeeOptions = {},
): Promise<NetworkFeeEstimate> {
  const { operationCount = 1, baseFeeStroops, signal } = options

  if (baseFeeStroops !== undefined && Number.isFinite(baseFeeStroops)) {
    return calculateTransactionFee(baseFeeStroops, operationCount, 'fallback')
  }

  const stats = await fetchNetworkFeeStats(signal)
  return calculateTransactionFee(stats.p50FeeStroops, operationCount, stats.source)
}
