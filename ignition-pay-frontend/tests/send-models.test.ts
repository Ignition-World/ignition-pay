import { describe, expect, it } from 'vitest'
import {
  NETWORK_FEE_XLM,
  formatAmount,
  spendableBalance,
  validateAmount,
  type SendableAsset,
} from '../features/send/models'

const xlm: SendableAsset = { code: 'XLM', issuer: 'native', balance: 100, reserved: 1.5 }
const usdc: SendableAsset = { code: 'USDC', issuer: 'GISSUER', balance: 50 }

describe('spendableBalance', () => {
  it('subtracts the reserve and network fee for the native asset', () => {
    expect(spendableBalance(xlm)).toBeCloseTo(100 - 1.5 - NETWORK_FEE_XLM, 7)
  })

  it('subtracts a custom dynamic network fee when provided', () => {
    const customFee = 0.00005
    expect(spendableBalance(xlm, customFee)).toBeCloseTo(100 - 1.5 - customFee, 7)
  })

  it('uses the full balance for issued assets', () => {
    expect(spendableBalance(usdc)).toBe(50)
  })

  it('never reports a negative balance', () => {
    expect(spendableBalance({ code: 'XLM', issuer: 'native', balance: 1, reserved: 5 })).toBe(0)
  })
})

describe('validateAmount', () => {
  it('accepts an amount within the spendable balance', () => {
    expect(validateAmount('10', usdc)).toEqual({ isValid: true })
    expect(validateAmount('50', usdc).isValid).toBe(true)
  })

  it('requires an amount', () => {
    expect(validateAmount('', usdc).error).toMatch(/Enter an amount/)
    expect(validateAmount('   ', usdc).error).toMatch(/Enter an amount/)
  })

  it('rejects zero, negative and non-numeric amounts', () => {
    expect(validateAmount('0', usdc).error).toMatch(/greater than zero/)
    expect(validateAmount('-5', usdc).error).toMatch(/must be a number/)
    expect(validateAmount('abc', usdc).error).toMatch(/must be a number/)
  })

  it('rejects more than seven decimal places', () => {
    expect(validateAmount('1.12345678', usdc).error).toMatch(/7 decimal places/)
    expect(validateAmount('1.1234567', usdc).isValid).toBe(true)
  })

  it('prevents sending more than the balance', () => {
    expect(validateAmount('50.01', usdc)).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/exceeds your available balance of 50 USDC/),
    })
  })

  it('accounts for the reserve and fee when spending the native asset', () => {
    // 100 XLM less the 1.5 reserve and the 0.00001 fee leaves 98.49999.
    expect(validateAmount('98.49999', xlm).isValid).toBe(true)
    expect(validateAmount('98.5', xlm).isValid).toBe(false)
  })

  it('accounts for custom dynamic fee when validating native asset amount', () => {
    const customFee = 0.0001 // 100 XLM - 1.5 - 0.0001 = 98.4999
    expect(validateAmount('98.4999', xlm, customFee).isValid).toBe(true)
    expect(validateAmount('98.49991', xlm, customFee).isValid).toBe(false)
  })
})

describe('formatAmount', () => {
  it('trims trailing zeroes at Stellar precision', () => {
    expect(formatAmount(10)).toBe('10')
    expect(formatAmount(98.49999)).toBe('98.49999')
    expect(formatAmount(1 / 3)).toBe('0.3333333')
  })
})
