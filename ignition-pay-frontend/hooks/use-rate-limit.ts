'use client'

import { useState, useCallback, useRef } from 'react'

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

function notifyListeners() {
  const status: RateLimitStatus = {
    remaining: rateLimitState.remaining,
    limit: rateLimitState.limit,
    resetAt: rateLimitState.resetAt,
    isNearLimit: rateLimitState.remaining / rateLimitState.limit <= WARNING_THRESHOLD,
    isRateLimited: rateLimitState.remaining <= 0,
  }
  rateLimitState.listeners.forEach((listener) => listener(status))
}

/**
 * Updates rate limit state from response headers
 */
export function updateRateLimitFromHeaders(headers: Headers): void {
  const remaining = headers.get('x-ratelimit-remaining')
  const limit = headers.get('x-ratelimit-limit')
  const reset = headers.get('x-ratelimit-reset')

  if (remaining !== null) rateLimitState.remaining = parseInt(remaining, 10)
  if (limit !== null) rateLimitState.limit = parseInt(limit, 10)
  if (reset !== null) {
    const resetTime = parseInt(reset, 10)
    rateLimitState.resetAt = resetTime > 0 ? resetTime * 1000 : Date.now() + (resetTime * 1000)
  }

  notifyListeners()
}

/**
 * Hook to track and display API rate limit status
 */
export function useRateLimit(): RateLimitStatus {
  const [status, setStatus] = useState<RateLimitStatus>({
    remaining: rateLimitState.remaining,
    limit: rateLimitState.limit,
    resetAt: rateLimitState.resetAt,
    isNearLimit: rateLimitState.remaining / rateLimitState.limit <= WARNING_THRESHOLD,
    isRateLimited: rateLimitState.remaining <= 0,
  })

  const listenerRef = useRef<(status: RateLimitStatus) => void>()

  useCallback(() => {
    listenerRef.current = setStatus
    rateLimitState.listeners.add(setStatus)

    return () => {
      if (listenerRef.current) {
        rateLimitState.listeners.delete(listenerRef.current)
      }
    }
  }, [])

  // Check if reset time has passed and reset counters
  if (rateLimitState.resetAt && Date.now() > rateLimitState.resetAt) {
    rateLimitState.remaining = rateLimitState.limit
    rateLimitState.resetAt = null
    notifyListeners()
  }

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
