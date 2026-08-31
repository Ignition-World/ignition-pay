import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BASE_FEE_STROOPS,
  DEFAULT_NETWORK_FEE_XLM,
  STROOPS_PER_XLM,
  calculateTransactionFee,
} from '../features/send/models'
import {
  estimateTransactionFee,
  fetchNetworkFeeStats,
} from '../features/send/services/fee'

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  } as Response)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('calculateTransactionFee', () => {
  it('calculates default fee for 1 operation at minimum base fee', () => {
    const fee = calculateTransactionFee(100, 1)

    expect(fee.feeInStroops).toBe(100)
    expect(fee.feeInXlm).toBe(0.00001)
    expect(fee.formattedFee).toBe('0.00001 XLM')
    expect(fee.operationCount).toBe(1)
    expect(fee.source).toBe('fallback')
    expect(fee.isDynamic).toBe(false)
  })

  it('calculates dynamic fee based on higher network base fee', () => {
    const fee = calculateTransactionFee(300, 1, 'horizon')

    expect(fee.feeInStroops).toBe(300)
    expect(fee.feeInXlm).toBe(0.00003)
    expect(fee.formattedFee).toBe('0.00003 XLM')
    expect(fee.source).toBe('horizon')
    expect(fee.isDynamic).toBe(true)
  })

  it('scales fee with transaction complexity (multiple operations)', () => {
    const fee = calculateTransactionFee(200, 3, 'horizon')

    // 200 stroops * 3 ops = 600 stroops = 0.00006 XLM
    expect(fee.feeInStroops).toBe(600)
    expect(fee.feeInXlm).toBe(0.00006)
    expect(fee.formattedFee).toBe('0.00006 XLM')
    expect(fee.operationCount).toBe(3)
  })

  it('clamps invalid base fee and operation count to safe minimums', () => {
    const fee = calculateTransactionFee(50, 0)

    expect(fee.baseFeeInStroops).toBe(BASE_FEE_STROOPS)
    expect(fee.operationCount).toBe(1)
    expect(fee.feeInStroops).toBe(BASE_FEE_STROOPS)
    expect(fee.feeInXlm).toBe(DEFAULT_NETWORK_FEE_XLM)
  })
})

describe('fetchNetworkFeeStats', () => {
  it('parses p50 fee from Horizon fee_stats', async () => {
    mockFetch({
      json: async () => ({
        last_ledger_base_fee: '100',
        fee_charged: {
          min: '100',
          mode: '150',
          p50: '250',
          p90: '500',
        },
      }),
    })

    const stats = await fetchNetworkFeeStats()

    expect(stats.baseFeeStroops).toBe(100)
    expect(stats.p50FeeStroops).toBe(250)
    expect(stats.source).toBe('horizon')
  })

  it('falls back to last_ledger_base_fee when fee_charged.p50 is missing', async () => {
    mockFetch({
      json: async () => ({
        last_ledger_base_fee: '150',
        fee_charged: {},
      }),
    })

    const stats = await fetchNetworkFeeStats()

    expect(stats.baseFeeStroops).toBe(150)
    expect(stats.p50FeeStroops).toBe(150)
    expect(stats.source).toBe('horizon')
  })

  it('falls back to default base fee when Horizon returns non-OK status', async () => {
    mockFetch({ ok: false, status: 503 })

    const stats = await fetchNetworkFeeStats()

    expect(stats.baseFeeStroops).toBe(BASE_FEE_STROOPS)
    expect(stats.p50FeeStroops).toBe(BASE_FEE_STROOPS)
    expect(stats.source).toBe('fallback')
  })

  it('falls back to default base fee on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network offline'))

    const stats = await fetchNetworkFeeStats()

    expect(stats.baseFeeStroops).toBe(BASE_FEE_STROOPS)
    expect(stats.p50FeeStroops).toBe(BASE_FEE_STROOPS)
    expect(stats.source).toBe('fallback')
  })
})

describe('estimateTransactionFee', () => {
  it('estimates fee dynamically from Horizon conditions and operation count', async () => {
    mockFetch({
      json: async () => ({
        last_ledger_base_fee: '100',
        fee_charged: {
          p50: '350',
        },
      }),
    })

    const estimate = await estimateTransactionFee({ operationCount: 2 })

    // 350 stroops * 2 ops = 700 stroops = 0.00007 XLM
    expect(estimate.feeInStroops).toBe(700)
    expect(estimate.feeInXlm).toBe(0.00007)
    expect(estimate.formattedFee).toBe('0.00007 XLM')
    expect(estimate.operationCount).toBe(2)
    expect(estimate.isDynamic).toBe(true)
  })

  it('uses baseFeeStroops override when provided without making a network call', async () => {
    const fetchSpy = mockFetch({})

    const estimate = await estimateTransactionFee({
      baseFeeStroops: 500,
      operationCount: 1,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(estimate.feeInStroops).toBe(500)
    expect(estimate.feeInXlm).toBe(0.00005)
    expect(estimate.formattedFee).toBe('0.00005 XLM')
  })
})
