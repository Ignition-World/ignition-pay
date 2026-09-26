'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  requestOnboardingTourRestart,
  useOnboardingTour,
} from '@/hooks/use-onboarding-tour'

/** Keeps the highlight ring clear of the element it points at. */
const HIGHLIGHT_PADDING = 6

/** Fixed ids so the dialog is named and described without relying on the primitive. */
const TITLE_ID = 'onboarding-tour-title'
const DESCRIPTION_ID = 'onboarding-tour-description'

interface HighlightRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Resolves a step target to the element that is actually on screen. Several
 * `data-tour` values are rendered more than once — the sidebar and the mobile
 * tab bar both mark up `Send` — and exactly one of the copies is laid out at
 * any viewport, so the first box with a real size wins.
 */
function findVisibleTarget(target: string): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`),
  )
  return (
    nodes.find((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }) ?? null
  )
}

/**
 * First-visit tour over the main navigation and the portfolio header. Renders
 * nothing once it has been seen, dismissed, or finished.
 *
 * The dialog primitive supplies the focus trap, the escape-to-close behaviour
 * and the accessible name/description wiring; the step change is announced
 * separately through a polite live region because focus stays inside the
 * dialog while the tour advances.
 */
export function OnboardingTour() {
  const {
    steps,
    step,
    stepIndex,
    isFirstStep,
    isLastStep,
    isOpen,
    next,
    back,
    dismiss,
  } = useOnboardingTour()
  const [rect, setRect] = useState<HighlightRect | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const node = findVisibleTarget(step.target)
    if (!node) {
      setRect(null)
      return
    }

    const measure = () => {
      const box = node.getBoundingClientRect()
      setRect({
        top: box.top - HIGHLIGHT_PADDING,
        left: box.left - HIGHLIGHT_PADDING,
        width: box.width + HIGHLIGHT_PADDING * 2,
        height: box.height + HIGHLIGHT_PADDING * 2,
      })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [isOpen, step.target])

  if (!isOpen) return null

  return (
    <>
      {/* Purely decorative: the dialog already carries the accessible copy.
          z-[60] keeps the ring above the dialog backdrop (z-50). */}
      {rect && (
        <div
          aria-hidden="true"
          data-slot="onboarding-tour-highlight"
          className="pointer-events-none fixed z-[60] rounded-xl border-2 border-primary shadow-lg transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) dismiss()
        }}
      >
        <DialogContent aria-labelledby={TITLE_ID} aria-describedby={DESCRIPTION_ID}>
          <DialogHeader>
            <DialogTitle id={TITLE_ID}>{step.title}</DialogTitle>
            <DialogDescription id={DESCRIPTION_ID}>{step.description}</DialogDescription>
          </DialogHeader>

          <p
            role="status"
            aria-live="polite"
            className="mt-4 text-xs font-medium text-muted-foreground"
          >
            Step {stepIndex + 1} of {steps.length}
          </p>

          <div aria-hidden="true" className="mt-2 flex items-center gap-1.5">
            {steps.map((item, index) => (
              <span
                key={item.target}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === stepIndex ? 'w-6 bg-primary' : 'w-1.5 bg-muted',
                )}
              />
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={dismiss}>
              Skip tour
            </Button>
            {!isFirstStep && (
              <Button variant="outline" onClick={back}>
                Back
              </Button>
            )}
            <Button onClick={isLastStep ? dismiss : next}>
              {isLastStep ? 'Done' : 'Next'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Drop-in control for a settings surface: clears the seen flag and replays the
 * tour from the first step.
 */
export function OnboardingTourRestartButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      className={className}
      onClick={requestOnboardingTourRestart}
    >
      Replay tour
    </Button>
  )
}

export default OnboardingTour
