'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Shortest time a skeleton stays on screen once it has appeared.
 *
 * A fast response is the awkward case, not the slow one: data arriving in 30ms
 * makes the skeleton flash and vanish, which reads as a glitch rather than as
 * loading. Holding it briefly costs nothing on a slow connection — the floor has
 * already elapsed by the time data lands — and removes the flicker on a fast one.
 */
export const MINIMUM_SKELETON_MS = 400

/**
 * Holds a loading flag `true` for at least `minimumMs` after it first turns on.
 *
 * Returns the caller's flag unchanged once the floor has elapsed, so a genuinely
 * slow request is never delayed further. Only the tail of a fast request is
 * extended.
 *
 * SSR-safe: the first render returns the flag as given and no timer is started
 * until the effect runs on the client.
 *
 * @param isLoading - The real loading state.
 * @param minimumMs - Floor in milliseconds. Defaults to {@link MINIMUM_SKELETON_MS}.
 * @returns Whether a skeleton should still be shown.
 */
export function useMinimumLoading(
  isLoading: boolean,
  minimumMs: number = MINIMUM_SKELETON_MS,
): boolean {
  const [isHeld, setIsHeld] = useState(isLoading)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      // Record the moment the skeleton became visible, but only on the leading
      // edge: a re-render while still loading must not restart the floor.
      if (shownAtRef.current === null) {
        shownAtRef.current = Date.now()
      }
      setIsHeld(true)
      return
    }

    // Never loaded in this cycle, so there is no skeleton to hold.
    if (shownAtRef.current === null) {
      setIsHeld(false)
      return
    }

    const remaining = minimumMs - (Date.now() - shownAtRef.current)

    if (remaining <= 0) {
      shownAtRef.current = null
      setIsHeld(false)
      return
    }

    const timer = setTimeout(() => {
      shownAtRef.current = null
      setIsHeld(false)
    }, remaining)

    return () => clearTimeout(timer)
  }, [isLoading, minimumMs])

  return isHeld
}
