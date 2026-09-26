/**
 * Memo validation for the send flow. Stellar supports four memo kinds; the
 * limits below come from the protocol: text memos are 28 *bytes* of UTF-8,
 * hash memos are 32 bytes (64 hex characters) and ID memos are uint64.
 */

export const MEMO_TYPES = ['none', 'text', 'id', 'hash'] as const

export type MemoType = (typeof MEMO_TYPES)[number]

export const MEMO_TEXT_MAX_BYTES = 28
export const MEMO_HASH_HEX_LENGTH = 64
/** 2^64 - 1, the largest value a Stellar ID memo can hold. */
export const MEMO_ID_MAX = BigInt('18446744073709551615')

export const MEMO_TYPE_LABELS: Record<MemoType, string> = {
  none: 'No memo',
  text: 'Text',
  id: 'ID',
  hash: 'Hash',
}

export const MEMO_TYPE_HINTS: Record<MemoType, string> = {
  none: 'Most personal payments do not need a memo.',
  text: `Up to ${MEMO_TEXT_MAX_BYTES} bytes of UTF-8 text. Exchanges often require this.`,
  id: 'An unsigned 64-bit number, commonly used by exchanges to identify your account.',
  hash: `A ${MEMO_HASH_HEX_LENGTH}-character hex hash. It cannot be edited or recovered once sent.`,
}

export interface MemoValidationResult {
  isValid: boolean
  error?: string
  /** Non-blocking note shown alongside a valid memo. */
  warning?: string
}

export function memoByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export function validateMemo(type: MemoType, value: string): MemoValidationResult {
  if (type === 'none') return { isValid: true }

  const memo = type === 'text' ? value : value.trim()

  if (memo.length === 0) {
    return { isValid: false, error: 'Enter a memo value, or choose “No memo”.' }
  }

  if (type === 'text') {
    const bytes = memoByteLength(memo)
    if (bytes > MEMO_TEXT_MAX_BYTES) {
      return {
        isValid: false,
        error: `Text memos are limited to ${MEMO_TEXT_MAX_BYTES} bytes (this one is ${bytes}).`,
      }
    }
    return { isValid: true }
  }

  if (type === 'id') {
    if (!/^\d+$/.test(memo)) {
      return { isValid: false, error: 'ID memos must contain digits only.' }
    }
    if (BigInt(memo) > MEMO_ID_MAX) {
      return { isValid: false, error: 'ID memos must fit in an unsigned 64-bit integer.' }
    }
    return { isValid: true }
  }

  if (!/^[0-9a-fA-F]+$/.test(memo)) {
    return { isValid: false, error: 'Hash memos must be hexadecimal.' }
  }
  if (memo.length !== MEMO_HASH_HEX_LENGTH) {
    return {
      isValid: false,
      error: `Hash memos must be exactly ${MEMO_HASH_HEX_LENGTH} hex characters (this one is ${memo.length}).`,
    }
  }

  return {
    isValid: true,
    warning: 'Hash memos are permanent — they cannot be edited or read back after sending.',
  }
}
