import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '../lib/constants/errors'

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'browserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'replay' })),
}))

vi.mock('@sentry/nextjs', () => sentry)

const queue = vi.hoisted(() => ({ getPendingTransactions: vi.fn() }))
vi.mock('../lib/transactionQueue', () => queue)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('consent storage', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips the stored analytics consent', async () => {
    const { getStoredConsent, storeConsent } = await import('../lib/consent')

    expect(getStoredConsent()).toBe(false)
    storeConsent(true)
    expect(getStoredConsent()).toBe(true)
    storeConsent(false)
    expect(getStoredConsent()).toBe(false)
  })
})

describe('useAnalyticsConsent', () => {
  beforeEach(() => window.localStorage.clear())

  it('hydrates from storage and persists changes', async () => {
    const { storeConsent } = await import('../lib/consent')
    storeConsent(true)

    const { useAnalyticsConsent } = await import('../hooks/use-consent')
    const { result } = renderHook(() => useAnalyticsConsent())

    await waitFor(() => expect(result.current.consented).toBe(true))

    result.current.setConsented(false)
    await waitFor(() => expect(window.localStorage.getItem('analytics_consent')).toBe('false'))
  })
})

describe('app version', () => {
  it('re-exports the version from package.json', async () => {
    const { APP_VERSION } = await import('../lib/version')
    const pkg = await import('../package.json')

    expect(APP_VERSION).toBe(pkg.default.version)
  })
})

describe('error reporting', () => {
  it('captures errors and messages, and manages the user context', async () => {
    const { captureError, captureMessage, setUserContext, clearUserContext } = await import(
      '../lib/errorUtils'
    )

    const error = new Error('boom')
    captureError(error, { errorCode: ErrorCode.AUTH_UNAUTHORIZED, statusCode: 401 })
    expect(sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { errorCode: ErrorCode.AUTH_UNAUTHORIZED, statusCode: 401 },
      }),
    )

    captureMessage('something happened', 'warning', { statusCode: 500 })
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'something happened',
      expect.objectContaining({ level: 'warning' }),
    )

    setUserContext('user-1', 'user@example.com')
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.com' })

    clearUserContext()
    expect(sentry.setUser).toHaveBeenCalledWith(null)
  })
})

describe('initSentry', () => {
  it('warns and does nothing without a DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { initSentry } = await import('../lib/sentry')
    initSentry()

    expect(warn).toHaveBeenCalled()
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('initialises Sentry with the configured DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.ingest.sentry.io/1')

    const { initSentry } = await import('../lib/sentry')
    initSentry()

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://example.ingest.sentry.io/1' }),
    )
  })
})

describe('useTransactionQueueCount', () => {
  it('reports the number of queued transactions', async () => {
    queue.getPendingTransactions.mockResolvedValue([{ id: 'a' }, { id: 'b' }])

    const { useTransactionQueueCount } = await import('../lib/useTransactionQueueCount')
    const { result, unmount } = renderHook(() => useTransactionQueueCount())

    await waitFor(() => expect(result.current).toBe(2))
    unmount()
  })

  it('falls back to zero when the queue cannot be read', async () => {
    queue.getPendingTransactions.mockRejectedValue(new Error('indexedDB unavailable'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { useTransactionQueueCount } = await import('../lib/useTransactionQueueCount')
    const { result, unmount } = renderHook(() => useTransactionQueueCount())

    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(result.current).toBe(0)
    unmount()
  })
})

describe('analytics', () => {
  it('never throws from track', async () => {
    const { track } = await import('../lib/analytics')
    expect(() => track('send_initiated', { amount: 1 })).not.toThrow()
  })
})
