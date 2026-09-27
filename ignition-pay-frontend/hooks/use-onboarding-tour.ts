'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/** Records that the visitor has finished or skipped the tour. */
export const ONBOARDING_TOUR_STORAGE_KEY = 'ignition-pay:onboarding-tour-seen'

/**
 * Window event used to replay the tour. The tour is mounted in the app shell
 * while the control that triggers it lives in a settings surface, so the two
 * communicate through an event instead of shared context.
 */
export const ONBOARDING_TOUR_RESTART_EVENT = 'ignition-pay:onboarding-tour-restart'

export interface OnboardingStep {
  /** Matches the `data-tour` attribute rendered by the component being explained. */
  target: string
  title: string
  description: string
}

/** The key features the tour walks through, in order. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    target: 'send',
    title: 'Send payments',
    description:
      'Move XLM or any Stellar asset to a public address. Fees settle in seconds.',
  },
  {
    target: 'receive',
    title: 'Receive funds',
    description:
      'Share a QR code or your address to get paid. Anchored assets arrive as trustlines.',
  },
  {
    target: 'balance',
    title: 'Watch your balance',
    description:
      'Your total portfolio value, 24 hour change and last refresh time live here.',
  },
  {
    target: 'history',
    title: 'Follow your history',
    description:
      'Every payment you send or receive is listed with its status and confirmations.',
  },
  {
    target: 'appearance',
    title: 'Make it yours',
    description:
      'Switch between light, dark and your system theme. High contrast is remembered too.',
  },
]

function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY) === 'true'
  } catch {
    // Private browsing modes can throw on access; treat it as "not seen".
    return false
  }
}

function rememberTour(): void {
  try {
    window.localStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, 'true')
  } catch {
    // Persistence is best-effort: the tour still closes for this session.
  }
}

/**
 * Replays the tour from anywhere in the app, e.g. a "Replay tour" control in
 * settings. The stored flag is cleared so the tour also shows on the next
 * mount if the app shell is not currently listening.
 */
export function requestOnboardingTourRestart(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ONBOARDING_TOUR_STORAGE_KEY)
  } catch {
    // The dispatched event below still replays the tour in this session.
  }
  window.dispatchEvent(new Event(ONBOARDING_TOUR_RESTART_EVENT))
}

/**
 * Drives the onboarding tour. Nothing here touches `localStorage` during
 * render: the first client render always reports "closed", matching the
 * server, and the tour is opened from an effect after mount.
 */
export function useOnboardingTour() {
  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  const start = useCallback(() => {
    setStepIndex(0)
    setIsOpen(true)
  }, [])

  /** Closing the tour, by any route, counts as having seen it. */
  const dismiss = useCallback(() => {
    rememberTour()
    setIsOpen(false)
  }, [])

  // First visit only.
  useEffect(() => {
    if (!hasSeenTour()) start()
  }, [start])

  // A restart from a settings surface reopens the tour from step one.
  useEffect(() => {
    const onRestart = () => start()
    window.addEventListener(ONBOARDING_TOUR_RESTART_EVENT, onRestart)
    return () => window.removeEventListener(ONBOARDING_TOUR_RESTART_EVENT, onRestart)
  }, [start])

  const next = useCallback(() => {
    setStepIndex((index) => Math.min(index + 1, ONBOARDING_STEPS.length - 1))
  }, [])

  const back = useCallback(() => {
    setStepIndex((index) => Math.max(index - 1, 0))
  }, [])

  const step = ONBOARDING_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1

  return useMemo(
    () => ({
      steps: ONBOARDING_STEPS,
      step,
      stepIndex,
      isFirstStep,
      isLastStep,
      isOpen,
      next,
      back,
      dismiss,
      restart: start,
    }),
    [step, stepIndex, isFirstStep, isLastStep, isOpen, next, back, dismiss, start],
  )
}
