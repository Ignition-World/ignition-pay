import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'

afterEach(cleanup)

/**
 * Issue #630 — WCAG 2.1 AA requirements for the dialog.
 *
 * The four criteria are focus trap, `aria-modal`, `aria-labelledby` pointing at
 * the title, and focus returning to the trigger on close. Most come from the
 * Base UI primitive, but "the primitive handles it" is a claim worth holding to a
 * test — a future swap of the primitive, or a consumer that omits the title,
 * breaks it silently.
 */
function Fixture({ withTitle = true }: { withTitle?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          {withTitle && <DialogTitle>Confirm payment</DialogTitle>}
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <input aria-label="Memo" />
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <button type="button">Confirm</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
  return waitFor(() => screen.getByRole('dialog'));
}

describe('dialog accessibility', () => {
  it('is not in the tree until opened', () => {
    render(<Fixture />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sets aria-modal on the dialog element', async () => {
    render(<Fixture />)
    const dialog = await open()

    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('names the dialog from its title', async () => {
    render(<Fixture />)
    const dialog = await open()

    // The accessible name is what a screen reader announces on entry.
    expect(dialog).toHaveAccessibleName('Confirm payment')

    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)?.textContent).toBe(
      'Confirm payment',
    )
  })

  it('describes the dialog from its description', async () => {
    render(<Fixture />)
    const dialog = await open()

    expect(dialog).toHaveAccessibleDescription('This action cannot be undone.')
  })

  it('moves focus into the dialog when it opens', async () => {
    render(<Fixture />)
    const dialog = await open()

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('returns focus to the trigger when closed with Escape', async () => {
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await open()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Losing the trigger strands a keyboard user at the top of the document.
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('returns focus to the trigger when closed by the close button', async () => {
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await open()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('renders a labelled close affordance', async () => {
    render(<Fixture />)
    await open()

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('can suppress the close button for a dialog that must be answered', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Required</DialogTitle>
          <button type="button">Acknowledge</button>
        </DialogContent>
      </Dialog>,
    )
    await open()

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('keeps the page behind the dialog out of the accessibility tree', async () => {
    render(
      <>
        <button type="button" data-testid="behind">
          Behind the dialog
        </button>
        <Fixture />
      </>,
    )
    await open()

    // Base UI hides the rest of the page while the modal is open, so the
    // background control is no longer exposed by role at all — which is the
    // behaviour we want. Queried by test id precisely because a role query
    // cannot see it any more.
    const outside = screen.getByTestId('behind')
    expect(outside.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Behind the dialog' })).toBeNull()
  })
})

describe('dialog accessibility — a dialog with no title', () => {
  it('has no accessible name, which is the bug this guards against', async () => {
    render(<Fixture withTitle={false} />)
    const dialog = await open()

    // Documented rather than asserted as correct: the primitive cannot invent a
    // name. Every consumer must render a DialogTitle, and this is the failure
    // mode to look for when a screen reader announces only "dialog".
    expect(dialog).toHaveAccessibleName('')
  })
})
