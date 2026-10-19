import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setUser: vi.fn(), setContext: vi.fn() }
  return {
    scope,
    captureException: vi.fn(),
    withScope: vi.fn((callback: (s: typeof scope) => void) => callback(scope)),
  }
})
vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  withScope: sentry.withScope,
}))

import GlobalError from '../app/global-error'
import { getErrorReportContext } from '../lib/error-report-context'

const ADDRESS = 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3'

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
})
afterEach(cleanup)

describe('GlobalError Sentry context (#867)', () => {
  it('attaches the wallet address and locale to the captured exception', () => {
    window.sessionStorage.setItem('ignition:wallet:address', ADDRESS)
    window.localStorage.setItem('ignition_pay_locale', 'fr')
    const error = new Error('render failed')

    render(<GlobalError error={error} reset={() => {}} />)

    expect(sentry.scope.setTag).toHaveBeenCalledWith('locale', 'fr')
    expect(sentry.scope.setUser).toHaveBeenCalledWith({ id: ADDRESS })
    expect(sentry.scope.setContext).toHaveBeenCalledWith('session', {
      locale: 'fr',
      walletAddress: ADDRESS,
    })
    expect(sentry.captureException).toHaveBeenCalledWith(error)
  })

  it('still reports the error when no wallet is connected', () => {
    const error = new Error('render failed')

    render(<GlobalError error={error} reset={() => {}} />)

    expect(sentry.scope.setUser).not.toHaveBeenCalled()
    expect(sentry.captureException).toHaveBeenCalledWith(error)
  })

  it('never throws when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => getErrorReportContext()).not.toThrow()
    expect(getErrorReportContext().walletAddress).toBeUndefined()
    spy.mockRestore()
  })
})
