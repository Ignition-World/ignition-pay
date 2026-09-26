import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ONBOARDING_STEPS,
  ONBOARDING_TOUR_STORAGE_KEY,
  requestOnboardingTourRestart,
} from '../hooks/use-onboarding-tour'
import {
  OnboardingTour,
  OnboardingTourRestartButton,
} from '../components/onboarding-tour'

/**
 * jsdom gives every element a zero-sized box, so the tour's "first laid out
 * match" lookup has to be taught about a viewport. Each visible target reports
 * a distinct box, which is what makes "the highlight followed the step"
 * observable, and a `hidden` target reports none — the same way the
 * `lg:hidden` sidebar copy and the mobile tab bar take turns being laid out.
 * `HIGHLIGHT_PADDING` in the component is 6px.
 */
const LAYOUT: Record<string, { top: number; left: number; width: number; height: number }> = {
  send: { top: 100, left: 20, width: 160, height: 40 },
  receive: { top: 300, left: 64, width: 200, height: 56 },
  balance: { top: 500, left: 8, width: 640, height: 180 },
  history: { top: 700, left: 32, width: 96, height: 24 },
  appearance: { top: 12, left: 480, width: 210, height: 36 },
}

const NO_BOX = { top: 0, left: 0, width: 0, height: 0 }

function stubLayout() {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(
    this: Element,
  ) {
    const tour = this.getAttribute('data-tour')
    const box = tour && !this.hasAttribute('hidden') ? LAYOUT[tour] : undefined
    return (box ?? NO_BOX) as DOMRect
  }

  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

describe('OnboardingTour', () => {
  let restoreLayout: () => void

  beforeEach(() => {
    localStorage.clear()
    restoreLayout = stubLayout()
  })

  afterEach(() => {
    cleanup()
    restoreLayout()
  })

  it('defines the send, receive, balance, history and appearance steps', () => {
    expect(ONBOARDING_STEPS.map((step) => step.target)).toEqual([
      'send',
      'receive',
      'balance',
      'history',
      'appearance',
    ])
    for (const step of ONBOARDING_STEPS) {
      expect(step.title).not.toBe('')
      expect(step.description).not.toBe('')
    }
  })

  it('opens on a first visit once mounted', async () => {
    render(<OnboardingTour />)

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    expect(screen.getByText(ONBOARDING_STEPS[0].description)).toBeInTheDocument()
    expect(screen.getByText(`Step 1 of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument()
  })

  it('stays closed on a later visit', async () => {
    localStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, 'true')

    render(<OnboardingTour />)

    await waitFor(() =>
      expect(screen.queryByText(ONBOARDING_STEPS[0].title)).not.toBeInTheDocument(),
    )
  })

  it('walks forward and backward through every step', async () => {
    render(<OnboardingTour />)
    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())

    for (let index = 1; index < ONBOARDING_STEPS.length; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() =>
        expect(screen.getByText(ONBOARDING_STEPS[index].title)).toBeInTheDocument(),
      )
      expect(screen.getByText(`Step ${index + 1} of ${ONBOARDING_STEPS.length}`)).toBeInTheDocument()
    }

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByText(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 2].title)).toBeInTheDocument(),
    )
  })

  it('hides the Back control on the first step', async () => {
    render(<OnboardingTour />)

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('remembers a finished tour', async () => {
    render(<OnboardingTour />)
    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())

    for (let index = 1; index < ONBOARDING_STEPS.length; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() =>
      expect(screen.queryByText(ONBOARDING_STEPS[0].title)).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY)).toBe('true')
  })

  it('remembers a skipped tour', async () => {
    render(<OnboardingTour />)
    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))

    await waitFor(() =>
      expect(screen.queryByText(ONBOARDING_STEPS[0].title)).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY)).toBe('true')
  })

  it('highlights the element the current step points at', async () => {
    render(
      <>
        <div data-tour="send">Send</div>
        <OnboardingTour />
      </>,
    )

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="onboarding-tour-highlight"]'),
      ).not.toBeNull()
    })

    const highlight = document.querySelector(
      '[data-slot="onboarding-tour-highlight"]',
    ) as HTMLElement

    // Padded by 6px around the 160x40 box the `send` target reports.
    expect(highlight).toHaveStyle({
      top: '94px',
      left: '14px',
      width: '172px',
      height: '52px',
    })
    expect(highlight).toHaveAttribute('aria-hidden', 'true')
  })

  it('repositions the highlight when the step changes', async () => {
    render(
      <>
        <div data-tour="send">Send</div>
        <div data-tour="receive">Receive</div>
        <OnboardingTour />
      </>,
    )

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[1].title)).toBeInTheDocument())
    const highlight = document.querySelector(
      '[data-slot="onboarding-tour-highlight"]',
    ) as HTMLElement
    expect(highlight).toHaveStyle({ top: '294px', left: '58px', width: '212px' })
  })

  it('skips a target that is not laid out at this viewport', async () => {
    render(
      <>
        {/* Hidden copies report a zero-sized box, like the `lg:hidden` sidebar. */}
        <div data-tour="send" hidden>
          Send
        </div>
        <div data-tour="receive">Receive</div>
        <OnboardingTour />
      </>,
    )

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    expect(document.querySelector('[data-slot="onboarding-tour-highlight"]')).toBeNull()
  })

  it('renders no highlight when the target is not on screen', async () => {
    render(<OnboardingTour />)

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    expect(document.querySelector('[data-slot="onboarding-tour-highlight"]')).toBeNull()
  })

  it('announces the step through a polite live region', async () => {
    render(<OnboardingTour />)

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    const status = screen.getByText(`Step 1 of ${ONBOARDING_STEPS.length}`)
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('role', 'status')
  })

  it('names the dialog after the current step', async () => {
    render(<OnboardingTour />)

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(ONBOARDING_STEPS[0].title)
    expect(dialog).toHaveAccessibleDescription(ONBOARDING_STEPS[0].description)
  })
})

describe('OnboardingTourRestartButton', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(cleanup)

  it('replays the tour from the first step', async () => {
    localStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, 'true')

    render(
      <>
        <OnboardingTourRestartButton />
        <OnboardingTour />
      </>,
    )
    await waitFor(() =>
      expect(screen.queryByText(ONBOARDING_TEPS[0].title)).not.toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Replay tour' }))

    await waitFor(() => expect(screen.getByText(ONBOARDING_STEPS[0].title)).toBeInTheDocument())
  })

  it('clears the seen flag so the tour shows again after a reload', () => {
    localStorage.setItem(ONBOARDING_TOUR_STORAGE_KEY, 'true')

    requestOnboardingTourRestart()

    expect(localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY)).toBeNull()
  })
})
