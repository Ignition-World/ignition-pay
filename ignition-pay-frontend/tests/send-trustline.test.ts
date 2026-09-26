import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkTrustline } from '../features/send/services'

const RECIPIENT = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'
const USDC_ISSUER = 'GBBD47UZQ5ODSQIRQ73RQ5NBAYKU5NK2HRE3ENDQMAIL7UCHQVCD2Z4A'

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

describe('checkTrustline', () => {
  it('skips the network call for the native asset', async () => {
    const fetchSpy = mockFetch({})

    await expect(checkTrustline(RECIPIENT, 'XLM', 'native')).resolves.toEqual({ status: 'ok' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports ok when the recipient holds the asset', async () => {
    mockFetch({
      json: async () => ({
        balances: [{ assetCode: 'USDC', assetIssuer: USDC_ISSUER, balance: '5' }],
      }),
    })

    await expect(checkTrustline(RECIPIENT, 'USDC', USDC_ISSUER)).resolves.toEqual({ status: 'ok' })
  })

  it('reports a missing trustline when the asset is absent', async () => {
    mockFetch({ json: async () => ({ balances: [{ assetType: 'native', balance: '10' }] }) })

    const result = await checkTrustline(RECIPIENT, 'USDC', USDC_ISSUER)

    expect(result.status).toBe('missing')
    expect(result.message).toMatch(/no USDC trustline/)
  })

  it('reports an unfunded account for a 404', async () => {
    mockFetch({ ok: false, status: 404 })

    const result = await checkTrustline(RECIPIENT, 'USDC', USDC_ISSUER)

    expect(result.status).toBe('unfunded')
  })

  it('degrades to unknown rather than throwing when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    const result = await checkTrustline(RECIPIENT, 'USDC', USDC_ISSUER)

    expect(result.status).toBe('unknown')
    expect(result.message).toMatch(/could not verify/)
  })

  it('degrades to unknown on a server error', async () => {
    mockFetch({ ok: false, status: 500 })

    await expect(checkTrustline(RECIPIENT, 'USDC', USDC_ISSUER)).resolves.toMatchObject({
      status: 'unknown',
    })
  })
})
