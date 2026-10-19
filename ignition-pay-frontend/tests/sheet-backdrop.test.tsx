import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet'

afterEach(cleanup)

/**
 * Issue #654 — the backdrop tap must close the sheet on Android Chrome.
 *
 * Base UI dismisses a drawer that renders a `Backdrop` through a synthesized
 * `click` on the backdrop element, and Android Chrome does not reliably deliver
 * that click after a touch that drifts. The backdrop therefore closes on the
 * pointer sequence it actually receives, and a press that began inside the sheet
 * (or left the backdrop) is never treated as a backdrop tap.
 */
function Fixture({
  onOpenChange,
  disablePointerDismissal,
}: {
  onOpenChange?: (open: boolean) => void
  disablePointerDismissal?: boolean
} = {}) {
  return (
    <Sheet onOpenChange={onOpenChange} disablePointerDismissal={disablePointerDismissal}>
      <SheetTrigger>Open sheet</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow down the transaction list.</SheetDescription>
        </SheetHeader>
        <button type="button">Apply filters</button>
      </SheetContent>
    </Sheet>
  )
}

async function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
  await waitFor(() => screen.getByRole('dialog'))

  const backdrop = document.querySelector('[data-slot="sheet-backdrop"]') as HTMLElement
  const content = document.querySelector('[data-slot="sheet-content"]') as HTMLElement

  expect(backdrop).not.toBeNull()
  expect(content).not.toBeNull()

  return { backdrop, content }
}

/** Opening also reports `true`, so only the close notifications matter here. */
function closeCalls(onOpenChange: { mock: { calls: unknown[][] } }) {
  return onOpenChange.mock.calls.filter(([open]) => open === false)
}

describe('sheet backdrop press', () => {
  it('covers the viewport so the tap target clears the 44px minimum', async () => {
    render(<Fixture />)
    const { backdrop } = await openSheet()

    // The backdrop is the dismiss surface. `inset-0` plus `min-h-dvh` makes it
    // span every pixel outside the sheet, far beyond 44 CSS px on any device.
    expect(backdrop.className).toContain('inset-0')
    expect(backdrop.className).toContain('min-h-dvh')
  })

  it('closes when a touch starts and ends on the backdrop', async () => {
    const onOpenChange = vi.fn()
    render(<Fixture onOpenChange={onOpenChange} />)
    const { backdrop } = await openSheet()

    fireEvent.pointerDown(backdrop, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(backdrop, { pointerType: 'touch', pointerId: 1 })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(closeCalls(onOpenChange)).toHaveLength(1)
  })

  it('does not dismiss when the press started inside the sheet', async () => {
    const onOpenChange = vi.fn()
    render(<Fixture onOpenChange={onOpenChange} />)
    const { backdrop, content } = await openSheet()

    fireEvent.pointerDown(content, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(backdrop, { pointerType: 'touch', pointerId: 1 })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(closeCalls(onOpenChange)).toHaveLength(0)
  })

  it('does not dismiss when the press left the backdrop', async () => {
    const onOpenChange = vi.fn()
    render(<Fixture onOpenChange={onOpenChange} />)
    const { backdrop } = await openSheet()

    fireEvent.pointerDown(backdrop, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerOut(backdrop, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(backdrop, { pointerType: 'touch', pointerId: 1 })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(closeCalls(onOpenChange)).toHaveLength(0)
  })

  it('ignores the backdrop press when pointer dismissal is disabled', async () => {
    const onOpenChange = vi.fn()
    render(<Fixture onOpenChange={onOpenChange} disablePointerDismissal />)
    const { backdrop } = await openSheet()

    fireEvent.pointerDown(backdrop, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(backdrop, { pointerType: 'touch', pointerId: 1 })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(closeCalls(onOpenChange)).toHaveLength(0)
  })
})
