import { describe, expect, it } from 'vitest'
import { MEMO_TEXT_MAX_BYTES, memoByteLength, validateMemo } from '../lib/stellar/memo'

describe('validateMemo', () => {
  it('accepts an absent memo', () => {
    expect(validateMemo('none', '')).toEqual({ isValid: true })
  })

  it('requires a value once a type is chosen', () => {
    expect(validateMemo('text', '').error).toMatch(/Enter a memo value/)
    expect(validateMemo('id', '   ').error).toMatch(/Enter a memo value/)
  })

  describe('text memos', () => {
    it('accepts text up to the byte limit', () => {
      expect(validateMemo('text', 'A'.repeat(MEMO_TEXT_MAX_BYTES)).isValid).toBe(true)
    })

    it('rejects text over the byte limit', () => {
      expect(validateMemo('text', 'A'.repeat(MEMO_TEXT_MAX_BYTES + 1)).error).toMatch(
        /limited to 28 bytes \(this one is 29\)/,
      )
    })

    it('counts bytes rather than characters for multi-byte text', () => {
      // Each emoji is 4 bytes, so 8 characters exceed the 28-byte limit.
      const emoji = '🚀'.repeat(8)

      expect(memoByteLength(emoji)).toBe(32)
      expect(validateMemo('text', emoji).isValid).toBe(false)
      expect(validateMemo('text', '🚀'.repeat(7)).isValid).toBe(true)
    })
  })

  describe('id memos', () => {
    it('accepts digits inside the uint64 range', () => {
      expect(validateMemo('id', '0').isValid).toBe(true)
      expect(validateMemo('id', '18446744073709551615').isValid).toBe(true)
    })

    it('rejects non-numeric and out-of-range values', () => {
      expect(validateMemo('id', '12a').error).toMatch(/digits only/)
      expect(validateMemo('id', '-1').error).toMatch(/digits only/)
      expect(validateMemo('id', '18446744073709551616').error).toMatch(/unsigned 64-bit/)
    })
  })

  describe('hash memos', () => {
    const hash = 'a'.repeat(64)

    it('accepts 64 hex characters and warns that they are permanent', () => {
      const result = validateMemo('hash', hash)

      expect(result.isValid).toBe(true)
      expect(result.warning).toMatch(/cannot be edited/)
    })

    it('rejects the wrong length or non-hex characters', () => {
      expect(validateMemo('hash', 'a'.repeat(63)).error).toMatch(/exactly 64 hex characters/)
      expect(validateMemo('hash', 'z'.repeat(64)).error).toMatch(/hexadecimal/)
    })
  })
})
