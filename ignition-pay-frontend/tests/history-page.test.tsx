import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from '../features/history/widgets/HistoryPage'
import { ToastProvider } from '../components/ui/toast'
import { fetchTransactions } from '@/features/history/services'
import type { Transaction } from '../features/history/models'

// The active filters live in the URL, so the page reads them from
// `useSearchParams` and writes them back with `router.replace`. Stand in for
// the Next router with a *stateful* query string: `replace` rewrites what
// `useSearchParams` returns and notifies its subscribers, so a reset click
// re-renders the page the way a real navigation does (#878).
const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    query: '',
    listeners,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    replace: vi.fn(),
  }
})

vi.mock('next/navigation', async () => {
  const React = await import('react')
  return {
    useRouter: () => ({
      replace: nav.replace,
      push: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    }),
    usePathname: () => '/history',
    useSearchParams: () => {
      // Mirror Next: the hook re-renders its consumer on every navigation.
      const [, setTick] = React.useState(0)
      React.useEffect(
        () => nav.subscribe(() => setTick((tick) => tick + 1)),
        [],
      )
      return new URLSearchParams(nav.query)
    },
  }
})

vi.mock('@/features/history/services', () => ({
  fetchTransactions: vi.fn(),
}))

function makeTransaction(id: string): Transaction {
  return {
    id,
    type: 'sent',
    asset: 'XLM',
    amount: 10,
    recipient: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    status: 'confirmed',
  }
}

function renderPage() {
  return render(
    <ToastProvider>
      <HistoryPage />
    </ToastProvider>,
  )
}

describe('HistoryPage', () => {
  beforeEach(() => {
    nav.query = ''
    nav.replace.mockImplementation((href: string) => {
      nav.query = String(href).split('?')[1] ?? ''
      nav.listeners.forEach((listener) => listener())
    })

    vi.mocked(fetchTransactions).mockReset()
    vi.mocked(fetchTransactions).mockResolvedValue({
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    })
  })

  afterEach(cleanup)

  it('renders the first page of transactions and a load-more hint when more history exists', async () => {
    vi.mocked(fetchTransactions).mockResolvedValue({
      data: [makeTransaction('tx-1')],
      nextCursor: 'cursor-1',
      hasNextPage: true,
      limit: 10,
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('Scroll to load more')).toBeInTheDocument(),
    )
    expect(screen.getByText('Transaction History')).toBeInTheDocument()
  })

  it('shows an illustrated empty state with a receive CTA when there is no history', async () => {
    vi.mocked(fetchTransactions).mockResolvedValue({
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText('No transactions yet')).toBeInTheDocument(),
    )

    const cta = screen.getByRole('link', { name: /start by receiving assets/i })
    expect(cta).toHaveAttribute('href', '/receive')
  })

  // #878 — the reset has to clear the *URL*, not only the parsed filter state,
  // otherwise navigating away and back restores the stale query string.
  describe('resetting filters clears the URL (#878)', () => {
    it('offers reset when the URL carries params the parser does not recognise', () => {
      // `type` is never parsed (the page writes `dir`) and `CONFIRMED` is not a
      // status the API accepts, so the view reads as unfiltered while these
      // params still sit in the URL — before the fix no reset was offered.
      nav.query = 'status=CONFIRMED&type=sent'
      renderPage()

      expect(fetchTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined, type: undefined }),
        expect.anything(),
      )

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))

      expect(nav.replace).toHaveBeenCalledWith('/history', { scroll: false })
      expect(nav.query).toBe('')
    })

    it('strips every active filter param so the list falls back to the default', async () => {
      nav.query = 'status=PENDING&asset=USDC&dir=sent&range=7d&q=abc'
      renderPage()

      expect(fetchTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING',
          asset: 'USDC',
          type: 'sent',
          search: 'abc',
        }),
        expect.anything(),
      )

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))

      await waitFor(() => {
        expect(nav.query).toBe('')
        expect(fetchTransactions).toHaveBeenLastCalledWith(
          {
            limit: 10,
            status: undefined,
            asset: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            search: undefined,
            type: undefined,
          },
          expect.anything(),
        )
      })
    })

    it('keeps query params that are not filters', () => {
      nav.query = 'status=FAILED&utm_source=mail'
      renderPage()

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))

      expect(nav.query).toBe('utm_source=mail')
    })

    it('shows the default list again after navigating away and back', async () => {
      nav.query = 'status=FAILED&type=sent'
      const { unmount } = renderPage()

      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
      await waitFor(() => expect(nav.query).toBe(''))

      // Leave the page and come back to the now-clean URL.
      unmount()
      renderPage()

      await waitFor(() =>
        expect(fetchTransactions).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: undefined, type: undefined }),
          expect.anything(),
        ),
      )
    })
  })
})
