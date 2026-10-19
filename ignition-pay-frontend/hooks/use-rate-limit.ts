'use client'

import { useEffect, useState } from 'react'

export interface RateLimitStatus {
  remaining: number
  limit: number
  resetAt: number | null
  isNearLimit: boolean
  isRateLimited: boolean
}

const DEFAULT_LIMIT = 100 // Default rate limit if not specified by API
const WARNING_THRESHOLD = 0.2 // Warn when 20% of requests remaining

const rateLimitState = {
  remaining: DEFAULT_LIMIT,
  limit: DEFAULT_LIMIT,
  resetAt: null as number | null,
  listeners: new Set<(status: RateLimitStatus) => void>(),
}

function currentStatus(): RateLimitStatus {
  return {
    remaining: rateLimitState.remaining,
    limit: rateLimitState.limit,
    resetAt: rateLimitState.resetAt,
    isNearLimit: rateLimitState.remaining / rateLimitState.limit <= WARNING_THRESHOLD,
    isRateLimited: rateLimitState.remaining <= 0,
  }
}

function notifyListeners() {
  const status = currentStatus()
  rateLimitState.listeners.forEach((listener) => listener(status))
}

/** Restores the full quota once the reset time has passed. Returns true if it did. */
function expireIfElapsed(): boolean {
  if (rateLimitState.resetAt && Date.now() > rateLimitState.resetAt) {
    rateLimitState.remaining = rateLimitState.limit
    rateLimitState.resetAt = null
    notifyListeners()
    return true
  }
  return false
}

/** Test helper: puts the shared rate-limit state back to its defaults. */
export function resetRateLimitState(): void {
  rateLimitState.remaining = DEFAULT_LIMIT
  rateLimitState.limit = DEFAULT_LIMIT
  rateLimitState.resetAt = null
  notifyListeners()
}

const RESET_CHECK_INTERVAL_MS = 1000

/**
 * Updates rate limit state from response headers
 */
export function updateRateLimitFromHeaders(headers: Headers): void {
  const remaining = headers.get('x-ratelimit-remaining')
  const limit = headers.get('x-ratelimit-limit')
  const reset = headers.get('x-ratelimit-reset')

  // Ignore malformed header values rather than storing NaN.
  const remainingValue = remaining === null ? NaN : parseInt(remaining, 10)
  const limitValue = limit === null ? NaN : parseInt(limit, 10)
  const resetValue = reset === null ? NaN : parseInt(reset, 10)

  if (!Number.isNaN(remainingValue)) rateLimitState.remaining = remainingValue
  if (!Number.isNaN(limitValue)) rateLimitState.limit = limitValue
  if (!Number.isNaN(resetValue)) {
    rateLimitState.resetAt = resetValue > 0 ? resetValue * 1000 : Date.now() + (resetValue * 1000)
  }

  notifyListeners()
}

/**
 * Hook to track and display API rate limit status.
 *
 * Subscribes to the shared state, so every response's headers update the
 * indicator immediately (a burst of requests can't leave it showing the
 * pre-burst value), and re-checks the reset time on a timer so the quota
 * refills even when no further requests are made.
 */
export function useRateLimit(): RateLimitStatus {
  const [status, setStatus] = useState<RateLimitStatus>(currentStatus)

  useEffect(() => {
    rateLimitState.listeners.add(setStatus)
    // Catch anything that changed between the first render and subscribing.
    setStatus(currentStatus())

    const timer = setInterval(expireIfElapsed, RESET_CHECK_INTERVAL_MS)

    return () => {
      rateLimitState.listeners.delete(setStatus)
      clearInterval(timer)
    }
  }, [])

  return status
}

/**
 * Wraps a fetch call with rate limit tracking
 */
export async function fetchWithRateLimit(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init)
  updateRateLimitFromHeaders(response.headers)
  return response
}
