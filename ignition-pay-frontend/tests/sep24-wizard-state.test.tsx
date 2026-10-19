import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/anchors/services', () => ({
  initiateSep24: vi.fn(),
  pollSep24Status: vi.fn(),
  isSep24Terminal: vi.fn(() => false),
  fetchAnchorHistory: vi.fn(),
  fetchQuote: vi.fn(),
}))
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))

import { SEP24_DRAFT_KEY, readSep24Draft, useSep24Wizard } from '../features/anchors/state'

function popTo(state: Record<string, unknown> | null) {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state }))
  })
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(cleanup)

describe('useSep24Wizard back/forward and persistence (#868)', () => {
  it('keeps the chosen currency when the browser goes back a step', () => {
    const { result } = renderHook(() => useSep24Wizard())

    act(() => result.current.open('Anchor'))
    act(() => result.current.setOperation('deposit'))
    act(() => result.current.setAssetCode('EUR'))
    expect(result.current.state.step).toBe('form')

    popTo({ sep24Step: 'operation' })

    expect(result.current.state.step).toBe('operation')
    expect(result.current.state.assetCode).toBe('EUR')
    expect(result.current.state.open).toBe(true)
  })

  it('goes forward again to the form without losing the selection', () => {
    const { result } = renderHook(() => useSep24Wizard())
    act(() => result.current.open('Anchor'))
    act(() => result.current.setOperation('deposit'))
    act(() => result.current.setAssetCode('GBP'))
    popTo({ sep24Step: 'operation' })

    popTo({ sep24Step: 'form' })

    expect(result.current.state.step).toBe('form')
    expect(result.current.state.assetCode).toBe('GBP')
  })

  it('hides the wizard but keeps the draft when back leaves it', () => {
    const { result } = renderHook(() => useSep24Wizard())
    act(() => result.current.open('Anchor'))
    act(() => result.current.setOperation('deposit'))
    act(() => result.current.setAssetCode('INR'))

    popTo(null)

    expect(result.current.state.open).toBe(false)
    expect(readSep24Draft()?.assetCode).toBe('INR')
  })

  it('restores the selection after a reload or reopened tab', () => {
    const first = renderHook(() => useSep24Wizard())
    act(() => first.result.current.open('Anchor'))
    act(() => first.result.current.setOperation('withdraw'))
    act(() => first.result.current.setAssetCode('THB'))
    act(() => first.result.current.setAmount('42'))
    first.unmount()

    const second = renderHook(() => useSep24Wizard())

    expect(second.result.current.state).toMatchObject({
      open: true,
      anchorName: 'Anchor',
      operation: 'withdraw',
      assetCode: 'THB',
      amount: '42',
      step: 'form',
    })
  })

  it('discards the draft when the wizard is closed', () => {
    const { result } = renderHook(() => useSep24Wizard())
    act(() => result.current.open('Anchor'))
    act(() => result.current.setAssetCode('EUR'))

    act(() => result.current.close())

    expect(window.localStorage.getItem(SEP24_DRAFT_KEY)).toBeNull()
  })

  it('ignores a stale draft', () => {
    window.localStorage.setItem(
      SEP24_DRAFT_KEY,
      JSON.stringify({ anchorName: 'A', operation: 'deposit', assetCode: 'EUR', amount: '', step: 'form', savedAt: 0 }),
    )
    expect(readSep24Draft()).toBeNull()
  })
})
