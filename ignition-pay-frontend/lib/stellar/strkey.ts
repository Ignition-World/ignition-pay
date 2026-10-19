/**
 * Minimal client-side StrKey decoding, used to validate a recipient address
 * before a payment is submitted. Mirrors SEP-23: base32(version byte ||
 * payload || CRC16-XModem checksum), with the checksum stored little-endian.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const VERSION_BYTES = {
  publicKey: 6 << 3, // G
  seed: 18 << 3, // S
  muxedAccount: 12 << 3, // M
  contract: 2 << 3, // C
} as const

/** Payload length in bytes, excluding version byte and checksum. */
const PAYLOAD_LENGTHS: Record<number, number> = {
  [VERSION_BYTES.publicKey]: 32,
  [VERSION_BYTES.muxedAccount]: 40,
  [VERSION_BYTES.contract]: 32,
}

/**
 * Encoded (base32) length per prefix. 35 payload bytes encode to 56 characters
 * for G/C addresses, while a muxed account's 43 bytes encode to 69.
 */
const ENCODED_LENGTHS: Record<string, number> = { G: 56, C: 56, M: 69 }

export type StellarAddressKind = 'publicKey' | 'muxedAccount' | 'contract'

export interface AddressValidationResult {
  isValid: boolean
  kind?: StellarAddressKind
  /** Human-readable reason, suitable for inline form feedback. */
  error?: string
}

function decodeBase32(input: string): Uint8Array | null {
  const bytes: number[] = []
  let accumulator = 0
  let bitsHeld = 0

  for (const character of input) {
    const value = BASE32_ALPHABET.indexOf(character)
    if (value === -1) return null

    accumulator = (accumulator << 5) | value
    bitsHeld += 5

    if (bitsHeld >= 8) {
      bitsHeld -= 8
      bytes.push((accumulator >> bitsHeld) & 0xff)
    }
  }

  // Any trailing bits must be zero padding, never data.
  if (bitsHeld > 0 && (accumulator & ((1 << bitsHeld) - 1)) !== 0) return null

  return Uint8Array.from(bytes)
}

/** CRC16-XModem: polynomial 0x1021, zero initial value. */
export function crc16xmodem(data: Uint8Array): number {
  let crc = 0x0000

  for (const byte of data) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }

  return crc
}

const KIND_BY_VERSION_BYTE: Record<number, StellarAddressKind> = {
  [VERSION_BYTES.publicKey]: 'publicKey',
  [VERSION_BYTES.muxedAccount]: 'muxedAccount',
  [VERSION_BYTES.contract]: 'contract',
}

/**
 * Validates a Stellar address, checking the encoding, the declared length and
 * the trailing CRC16 checksum so typos are caught before submitting a payment.
 */
export function validateStellarAddress(value: string): AddressValidationResult {
  const address = value.trim()

  if (address.length === 0) {
    return { isValid: false, error: 'Enter a recipient address.' }
  }

  if (address !== address.toUpperCase()) {
    return { isValid: false, error: 'Stellar addresses are uppercase.' }
  }

  if (address.startsWith('S')) {
    return {
      isValid: false,
      error: 'That looks like a secret key. Never share it — paste the recipient’s public key instead.',
    }
  }

  if (!/^[GMC]/.test(address)) {
    return { isValid: false, error: 'Address must start with G, M or C.' }
  }

  const expectedLength = ENCODED_LENGTHS[address[0]]
  if (address.length !== expectedLength) {
    return {
      isValid: false,
      error: `A ${address[0]}… address is ${expectedLength} characters (this one is ${address.length}).`,
    }
  }

  const decoded = decodeBase32(address)
  if (!decoded || decoded.length < 3) {
    return { isValid: false, error: 'Address contains characters that are not valid base32.' }
  }

  const versionByte = decoded[0]
  const kind = KIND_BY_VERSION_BYTE[versionByte]
  if (!kind) {
    return { isValid: false, error: 'Unsupported address type.' }
  }

  const payload = decoded.subarray(0, decoded.length - 2)
  if (payload.length - 1 !== PAYLOAD_LENGTHS[versionByte]) {
    return { isValid: false, error: `A ${address[0]}… address must be a different length.` }
  }

  const expected = crc16xmodem(payload)
  const actual = decoded[decoded.length - 2] | (decoded[decoded.length - 1] << 8)
  if (expected !== actual) {
    return { isValid: false, error: 'Checksum does not match — check the address for typos.' }
  }

  return { isValid: true, kind }
}

/** Shortens an address for display, e.g. `GABC…WXYZ`. */
export function truncateAddress(address: string, lead = 6, tail = 6): string {
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}
