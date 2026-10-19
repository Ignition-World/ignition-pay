import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TransactionRow } from '../components/transaction-row'
import { useRovingFocus } from '../hooks/use-roving-focus'
import type { Transaction } from '../features/history/models'
import { LanguageProvider } from '../lib/i18n'

afterEach(cleanup)

const RECIPIENT = 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3'

function tx(id: string): Transaction {
  return {
    id,
    type: 'sent',
    asset: 'XLM',
    amount: 10,
    recipient: RECIPIENT,
    timestamp: new Date('2026-01-01T00:00:00Z'),
    status: 'confirmed',
  } as Transaction
}

/**
 * Issue #628 — keyboard navigation for the transaction list.
 *
 * Rows were already links, so Tab reached them and Enter opened them. What was
 * missing was arrow-key movement, Space activation, a visible focus indicator,
 * and — the part that makes the list usable at all — a single tab stop instead of
 * one per row.
 */
function List({ ids }: { ids: string[] }) {
  const { containerRef, onKeyDown, itemTabIndex } = useRovingFocus<HTMLUListElement>({
    itemCount: ids.length,
  })

  return (
    <LanguageProvider>
      <ul ref={containerRef} onKeyDown={onKeyDown} aria-label="Transaction history">
        {ids.map((id, index) => (
          <li key={id}>
            <TransactionRow transaction={tx(id)} tabIndex={itemTabIndex(index)} />
          </li>
        ))}
      </ul>
    </LanguageProvider>
  )
}

function rows() {
  return screen.getAllByRole('link')
}

describe('roving focus over the transaction list', () => {
  it('makes the list a single tab stop', () => {
    render(<List ids={['a', 'b', 'c']} />)
    const [first, second, third] = rows()

    // One reachable row; the rest are -1 so Tab leaves the list in one press.
    expect(first).toHaveAttribute('tabindex', '0')
    expect(second).toHaveAttribute('tabindex', '-1')
    expect(third).toHaveAttribute('tabindex', '-1')
  })

  it('moves down with ArrowDown', () => {
    render(<List ids={['a', 'b', 'c']} />)
    const list = screen.getByRole('list')
    const [first, second] = rows()

    first.focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'ArrowDown' })
    })

    expect(document.activeElement).toBe(second)
    expect(second).toHaveAttribute('tabindex', '0')
    expect(first).toHaveAttribute('tabindex', '-1')
  })

  it('moves back up with ArrowUp', () => {
    render(<List ids={['a', 'b', 'c']} />)
    const list = screen.getByRole('list')
    const [first, second] = rows()

    second.focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'ArrowUp' })
    })

    expect(document.activeElement).toBe(first)
  })

  it('clamps at the ends instead of wrapping', () => {
    render(<List ids={['a', 'b']} />)
    const list = screen.getByRole('list')
    const [first, second] = rows()

    first.focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'ArrowUp' })
    })
    expect(document.activeElement).toBe(first)

    second.focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'ArrowDown' })
    })
    // Wrapping to the top of a long, paginated list reads as a glitch.
    expect(document.activeElement).toBe(second)
  })

  it('jumps to the ends with Home and End', () => {
    render(<List ids={['a', 'b', 'c', 'd']} />)
    const list = screen.getByRole('list')
    const items = rows()

    items[1].focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'End' })
    })
    expect(document.activeElement).toBe(items[3])

    act(() => {
      fireEvent.keyDown(list, { key: 'Home' })
    })
    expect(document.activeElement).toBe(items[0])
  })

  it('activates the focused row with Space', () => {
    render(<List ids={['a', 'b']} />)
    const list = screen.getByRole('list')
    const [, second] = rows()
    const clicked = vi.fn()
    second.addEventListener('click', clicked)

    second.focus()
    act(() => {
      fireEvent.keyDown(list, { key: ' ' })
    })

    // An anchor fires on Enter natively but never on Space.
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('leaves other keys alone', () => {
    render(<List ids={['a', 'b']} />)
    const list = screen.getByRole('list')
    const [first] = rows()

    first.focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'x' })
    })

    expect(document.activeElement).toBe(first)
  })

  it('follows focus that moved by other means', () => {
    render(<List ids={['a', 'b', 'c']} />)
    const list = screen.getByRole('list')
    const items = rows()

    // A click or a screen-reader jump moves focus without touching the handler.
    items[2].focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'ArrowUp' })
    })

    expect(document.activeElement).toBe(items[1])
  })

  it('gives every row a visible focus indicator', () => {
    render(<List ids={['a']} />)
    const [first] = rows()

    expect(first.className).toContain('focus-visible:ring-2')
  })

  it('exposes the rows as a labelled list', () => {
    render(<List ids={['a', 'b']} />)

    expect(screen.getByRole('list', { name: 'Transaction history' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('useRovingFocus bookkeeping', () => {
  it('does nothing when the list is empty', () => {
    const { result } = renderHook(() => useRovingFocus({ itemCount: 0 }))

    expect(result.current.activeIndex).toBe(0)
    expect(() =>
      result.current.onKeyDown({
        key: 'ArrowDown',
        preventDefault: () => {},
      } as never),
    ).not.toThrow()
  })

  it('pulls the only tab stop back inside the list when it shrinks', () => {
    const { rerender } = render(<List ids={['a', 'b', 'c', 'd', 'e']} />)
    const list = screen.getByRole('list')

    rows()[0].focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'End' })
    })
    expect(rows()[4]).toHaveAttribute('tabindex', '0')

    // A filter change can leave the active index past the end, which would leave
    // the list with no reachable row at all.
    rerender(<List ids={['a', 'b']} />)

    const remaining = rows()
    expect(remaining).toHaveLength(2)
    expect(remaining[1]).toHaveAttribute('tabindex', '0')
    expect(remaining[0]).toHaveAttribute('tabindex', '-1')
  })

  it('returns to the first row when the list is refilled', () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} />)
    const list = screen.getByRole('list')

    rows()[0].focus()
    act(() => {
      fireEvent.keyDown(list, { key: 'End' })
    })

    rerender(<List ids={[]} />)
    rerender(<List ids={['x', 'y']} />)

    expect(rows()[0]).toHaveAttribute('tabindex', '0')
  })
})
