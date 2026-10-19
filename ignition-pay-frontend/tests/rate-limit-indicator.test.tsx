import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RateLimitIndicator } from '../components/rate-limit-indicator'
import { resetRateLimitState, updateRateLimitFromHeaders } from '../hooks/use-rate-limit'

const headers = (remaining: number, limit = 100) =>
  new Headers({
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-limit': String(limit),
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
  })

beforeEach(resetRateLimitState)
afterEach(cleanup)

describe('RateLimitIndicator (#869)', () => {
  it('shows nothing while plenty of quota remains', () => {
    render(<RateLimitIndicator />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('updates immediately when response headers report a burst', () => {
    render(<RateLimitIndicator />)

    act(() => updateRateLimitFromHeaders(headers(15)))
    expect(screen.getByRole('alert')).toHaveTextContent('15/100 requests remaining')

    // A rapid follow-up must replace the value, not leave the earlier one on screen.
    act(() => updateRateLimitFromHeaders(headers(3)))
    expect(screen.getByRole('alert')).toHaveTextContent('3/100 requests remaining')

    act(() => updateRateLimitFromHeaders(headers(0)))
    expect(screen.getByRole('alert')).toHaveTextContent('Rate limit reached')
  })

  it('ignores malformed header values', () => {
    render(<RateLimitIndicator />)
    act(() => updateRateLimitFromHeaders(headers(10)))
    act(() => updateRateLimitFromHeaders(new Headers({ 'x-ratelimit-remaining': 'oops' })))
    expect(screen.getByRole('alert')).toHaveTextContent('10/100 requests remaining')
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render(<RateLimitIndicator />)
    unmount()
    expect(() => act(() => updateRateLimitFromHeaders(headers(1)))).not.toThrow()
  })
})
