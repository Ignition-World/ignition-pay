import { describe, expect, it } from 'vitest'
import { parsePaymentRequest } from '../lib/stellar/paymentRequest'

const VALID_PUBLIC_KEY = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'

describe('parsePaymentRequest', () => {
  it('returns null when the link has no destination', () => {
    expect(parsePaymentRequest(new URLSearchParams('amount=5'))).toBeNull()
  })

  it('accepts a valid destination with amount and memo', () => {
    const result = parsePaymentRequest(
      new URLSearchParams({ destination: VALID_PUBLIC_KEY, amount: '12.5', memo: 'rent' }),
    )
    expect(result).toEqual({ ok: true, destination: VALID_PUBLIC_KEY, amount: '12.5', memo: 'rent' })
  })

  it('rejects a malformed destination with a friendly error', () => {
    const result = parsePaymentRequest(new URLSearchParams({ destination: 'not-an-address' }))
    expect(result?.ok).toBe(false)
    if (result && !result.ok) expect(result.error).toContain('invalid destination')
  })

  it('rejects a secret key in the destination', () => {
    const result = parsePaymentRequest(new URLSearchParams({ destination: 'S' + 'A'.repeat(55) }))
    expect(result?.ok).toBe(false)
  })

  it('drops malformed amounts but keeps a valid destination', () => {
    const result = parsePaymentRequest(
      new URLSearchParams({ destination: VALID_PUBLIC_KEY, amount: '1.123456789' }),
    )
    expect(result).toEqual({ ok: true, destination: VALID_PUBLIC_KEY, amount: undefined, memo: undefined })
  })
})
