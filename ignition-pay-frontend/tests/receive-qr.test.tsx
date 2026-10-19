import '@testing-library/jest-dom/vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QRCodeDisplay } from '../features/receive/widgets/QRCodeDisplay'
import {
  RECEIVE_ASSETS,
  buildPaymentUri,
  normalizeReceiveAmount,
} from '../features/receive/models'

const qr = vi.hoisted(() => ({ toCanvas: vi.fn().mockResolvedValue(undefined) }))
vi.mock('qrcode', () => ({ default: qr, toCanvas: qr.toCanvas }))

const ADDRESS = 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3'
const XLM = RECEIVE_ASSETS[0]
const USDC = RECEIVE_ASSETS[1]

beforeEach(() => qr.toCanvas.mockClear())
afterEach(cleanup)

describe('buildPaymentUri (#870)', () => {
  it('is the bare address when nothing beyond XLM is selected', () => {
    expect(buildPaymentUri({ address: ADDRESS, asset: XLM })).toBe(ADDRESS)
  })

  it('encodes a non-native asset with its issuer', () => {
    const uri = new URL(buildPaymentUri({ address: ADDRESS, asset: USDC }).replace('web+stellar:', 'http://x/'))
    expect(uri.searchParams.get('destination')).toBe(ADDRESS)
    expect(uri.searchParams.get('asset_code')).toBe('USDC')
    expect(uri.searchParams.get('asset_issuer')).toBe(USDC.issuer)
  })

  it('encodes amount and memo', () => {
    const uri = new URL(
      buildPaymentUri({ address: ADDRESS, asset: XLM, amount: '12.5', memo: 'order 42' }).replace(
        'web+stellar:',
        'http://x/',
      ),
    )
    expect(uri.searchParams.get('amount')).toBe('12.5')
    expect(uri.searchParams.get('memo')).toBe('order 42')
    expect(uri.searchParams.get('memo_type')).toBe('MEMO_TEXT')
    expect(uri.searchParams.get('asset_code')).toBeNull()
  })

  it('ignores malformed or non-positive amounts', () => {
    for (const bad of ['abc', '-1', '0', '1.12345678', '']) {
      expect(normalizeReceiveAmount(bad)).toBeUndefined()
    }
    expect(buildPaymentUri({ address: ADDRESS, asset: XLM, amount: 'abc' })).toBe(ADDRESS)
  })

  it('is empty without an address', () => {
    expect(buildPaymentUri({ address: '', asset: USDC })).toBe('')
  })
})

describe('QRCodeDisplay re-encoding (#870)', () => {
  it('encodes the new payload, not the previous one, when the selection changes', async () => {
    const first = buildPaymentUri({ address: ADDRESS, asset: XLM })
    const second = buildPaymentUri({ address: ADDRESS, asset: USDC, amount: '5' })

    const { rerender } = render(<QRCodeDisplay address={ADDRESS} payload={first} />)
    await waitFor(() => expect(qr.toCanvas).toHaveBeenCalledTimes(1))
    expect(qr.toCanvas.mock.calls[0][1]).toBe(first)

    rerender(<QRCodeDisplay address={ADDRESS} payload={second} />)
    await waitFor(() => expect(qr.toCanvas).toHaveBeenCalledTimes(2))
    expect(qr.toCanvas.mock.calls[1][1]).toBe(second)
  })

  it('falls back to the address when no payload is given', async () => {
    render(<QRCodeDisplay address={ADDRESS} />)
    await waitFor(() => expect(qr.toCanvas).toHaveBeenCalled())
    expect(qr.toCanvas.mock.calls[0][1]).toBe(ADDRESS)
  })
})
