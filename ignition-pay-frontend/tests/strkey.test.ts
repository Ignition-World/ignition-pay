import { describe, expect, it } from 'vitest'
import { crc16xmodem, truncateAddress, validateStellarAddress } from '../lib/stellar/strkey'

// Well-known test vectors from SEP-23.
const VALID_PUBLIC_KEY = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'
// Muxed form of VALID_PUBLIC_KEY with id 0 (SEP-23 med25519: id then key).
const VALID_MUXED = 'MAAAAAAAAAAAAAB7BQ2L7E5NBWMXDUCMZSIPOBKRDSBYVLMXGSSKF6YNPIB7Y77ITLVL6'
const VALID_CONTRACT = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE'
const VALID_SECRET = 'SBUV3MRWKNS6AYKZ6E6MOUVF2OYMON3MIUASWL3JLY5E3ISDJFELYBRZ'

describe('crc16xmodem', () => {
  it('matches known checksums', () => {
    expect(crc16xmodem(new Uint8Array())).toBe(0x0000)
    expect(crc16xmodem(new TextEncoder().encode('123456789'))).toBe(0x31c3)
  })
})

describe('validateStellarAddress', () => {
  it('accepts a valid ed25519 public key', () => {
    expect(validateStellarAddress(VALID_PUBLIC_KEY)).toEqual({
      isValid: true,
      kind: 'publicKey',
    })
  })

  it('accepts muxed and contract addresses', () => {
    expect(validateStellarAddress(VALID_MUXED).kind).toBe('muxedAccount')
    expect(validateStellarAddress(VALID_CONTRACT).kind).toBe('contract')
  })

  it('ignores surrounding whitespace from a paste', () => {
    expect(validateStellarAddress(`  ${VALID_PUBLIC_KEY}  `).isValid).toBe(true)
  })

  it('rejects an empty address', () => {
    expect(validateStellarAddress('')).toMatchObject({ isValid: false })
    expect(validateStellarAddress('   ').error).toMatch(/Enter a recipient address/)
  })

  it('rejects a secret key with a warning not to share it', () => {
    const result = validateStellarAddress(VALID_SECRET)

    expect(result.isValid).toBe(false)
    expect(result.error).toMatch(/secret key/i)
  })

  it('rejects an unsupported prefix', () => {
    expect(validateStellarAddress('XA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ').error).toMatch(
      /must start with G, M or C/,
    )
  })

  it('rejects a wrong length', () => {
    expect(validateStellarAddress(VALID_PUBLIC_KEY.slice(0, 55)).error).toMatch(
      /is 56 characters \(this one is 55\)/,
    )
  })

  it('rejects characters outside the base32 alphabet', () => {
    const withInvalidChar = `${VALID_PUBLIC_KEY.slice(0, 55)}1`

    expect(validateStellarAddress(withInvalidChar).error).toMatch(/not valid base32/)
  })

  it('rejects a single-character typo that breaks the checksum', () => {
    const typo = `${VALID_PUBLIC_KEY.slice(0, 20)}X${VALID_PUBLIC_KEY.slice(21)}`

    expect(validateStellarAddress(typo)).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/Checksum does not match/),
    })
  })

  it('rejects a lowercase address rather than silently normalising it', () => {
    expect(validateStellarAddress(VALID_PUBLIC_KEY.toLowerCase()).error).toMatch(/uppercase/)
  })
})

describe('truncateAddress', () => {
  it('shortens long addresses and leaves short ones alone', () => {
    expect(truncateAddress(VALID_PUBLIC_KEY)).toBe('GA7QYN…UJVSGZ')
    expect(truncateAddress('GABC')).toBe('GABC')
  })
})
