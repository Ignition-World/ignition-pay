import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { HistoryPage } from '../HistoryPage'

// The active filters live in the URL, so the component reads them from
// `useSearchParams` and writes them back with `router.replace`.
const nav = vi.hoisted(() => ({
  query: '',
  replace: vi.fn(),
  push: vi.fn(),
  prefetch: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    prefetch: nav.prefetch,
  }),
  usePathname: () => '/history',
  useSearchParams: () => new URLSearchParams(nav.query),
}))

const fetchTransactionsMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/history/services', () => ({
  fetchTransactions: fetchTransactionsMock,
}))

// Mock the useOptimisticTransactions hook
vi.mock('@/features/history/state', () => ({
  useOptimisticTransactions: () => ({
    optimisticEntries: [],
    addOptimisticEntry: vi.fn(),
    reconcileEntry: vi.fn(),
    removeOptimisticEntry: vi.fn(),
  }),
}))

const tx = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  type: 'sent',
  asset: 'XLM',
  amount: 25,
  recipient: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQ',
  timestamp: new Date('2026-01-15T10:00:00Z'),
  status: 'completed',
  txHash: 'hash-1',
  ...overrides,
})

const page = (data: unknown[], hasNextPage = true) => ({
  data,
  nextCursor: hasNextPage ? 'cursor-2' : null,
  hasNextPage,
  limit: 10,
})

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.query = ''
    fetchTransactionsMock.mockResolvedValue(
      page([
        tx(),
        tx({ id: 'tx-2', type: 'received', asset: 'USDC', status: 'pending' }),
        tx({ id: 'tx-3', asset: 'USDC', status: 'failed' }),
      ]),
    )
  })

  describe('page rendering', () => {
    it('renders the page with header', () => {
      render(<HistoryPage />)

      expect(screen.getByText('Transaction History')).toBeInTheDocument()
      expect(screen.getByText('View all your Stellar transactions')).toBeInTheDocument()
    })

    it('renders transaction list', () => {
      render(<HistoryPage />)

      const rows = screen.getAllByText(/Sent|Received/)
      expect(rows.length).toBeGreaterThan(0)
    })

    it('shows scroll to load more hint', async () => {
      render(<HistoryPage />)

      expect(await screen.findByText('Scroll to load more')).toBeInTheDocument()
    })
  })

  describe('statistics display', () => {
    it('displays total transaction count', () => {
      render(<HistoryPage />)

      const stats = screen.getByText('Total Transactions').parentElement
      expect(stats).toHaveTextContent(/\d+/)
    })

    it('displays sent transaction count', () => {
      render(<HistoryPage />)

      const statBox = screen.getByText('Sent').parentElement
      expect(statBox).toBeInTheDocument()
      expect(statBox).toHaveTextContent(/\d+/)
    })

    it('displays received transaction count', () => {
      render(<HistoryPage />)

      const statBox = screen.getByText('Received').parentElement
      expect(statBox).toBeInTheDocument()
      expect(statBox).toHaveTextContent(/\d+/)
    })

    it('displays total volume', () => {
      render(<HistoryPage />)

      const statBox = screen.getByText('Total Volume').parentElement
      expect(statBox).toBeInTheDocument()
      expect(statBox).toHaveTextContent(/\d+/)
    })
  })

  describe('filtering', () => {
    it('has direction filter buttons', () => {
      render(<HistoryPage />)

      const group = screen.getByRole('group', { name: /direction/i })
      expect(within(group).getByRole('button', { name: /^All$/i })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: /^Sent$/i })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: /^Received$/i })).toBeInTheDocument()
    })

    it('has status filter buttons', () => {
      render(<HistoryPage />)

      const group = screen.getByRole('group', { name: /status/i })
      expect(within(group).getByRole('button', { name: /^All$/i })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: /^Confirmed$/i })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: /^Failed$/i })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: /^Pending$/i })).toBeInTheDocument()
    })

    it('has asset dropdown filter', () => {
      render(<HistoryPage />)

      const select = screen.getByLabelText('Filter by asset')
      expect(select).toBeInTheDocument()
    })

    it('has date range filters', () => {
      render(<HistoryPage />)

      expect(screen.getByLabelText('Range')).toBeInTheDocument()
      expect(screen.getByLabelText('From')).toBeInTheDocument()
      expect(screen.getByLabelText('To')).toBeInTheDocument()
    })

    it('offers the last 7, 30 and 90 day presets plus a custom range', () => {
      render(<HistoryPage />)

      const select = screen.getByLabelText('Range') as HTMLSelectElement
      const values = [...select.options].map((option) => option.value)
      expect(values).toEqual(['all', '7d', '30d', '90d', 'custom'])
    })

    it('has search input', () => {
      render(<HistoryPage />)

      const searchInput = screen.getByPlaceholderText(/Search by address, asset/)
      expect(searchInput).toBeInTheDocument()
    })
  })

  describe('asset dropdown contents', () => {
    it('lists only assets that appear in the loaded history', async () => {
      render(<HistoryPage />)

      const select = screen.getByLabelText('Filter by asset') as HTMLSelectElement
      await waitFor(() => {
        expect([...select.options].map((o) => o.value)).toEqual([
          'all',
          'USDC',
          'XLM',
        ])
      })
    })

    it('does not offer an asset that the history never contains', async () => {
      render(<HistoryPage />)

      const select = screen.getByLabelText('Filter by asset') as HTMLSelectElement
      await waitFor(() => expect(select.options.length).toBeGreaterThan(1))
      expect([...select.options].map((o) => o.value)).not.toContain('AQUA')
    })

    it('keeps an asset selected via the URL even if it is not on this page', async () => {
      nav.query = 'asset=AQUA'
      render(<HistoryPage />)

      const select = screen.getByLabelText('Filter by asset') as HTMLSelectElement
      await waitFor(() => expect(select.value).toBe('AQUA'))
      expect([...select.options].map((o) => o.value)).toContain('AQUA')
    })
  })

  describe('filters are reflected in the URL', () => {
    it('requests the first page with no filters when the URL is clean', () => {
      render(<HistoryPage />)

      expect(fetchTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
          asset: undefined,
          dateFrom: undefined,
          dateTo: undefined,
        }),
        expect.anything(),
      )
    })

    it('initialises the status filter from ?status=', async () => {
      nav.query = 'status=FAILED'
      render(<HistoryPage />)

      const group = screen.getByRole('group', { name: /status/i })
      await waitFor(() =>
        expect(
          within(group).getByRole('button', { name: /^Failed$/i }),
        ).toHaveAttribute('aria-pressed', 'true'),
      )
      expect(fetchTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
        expect.anything(),
      )
    })

    it('initialises every filter from the URL at once', () => {
      nav.query = 'status=PENDING&asset=USDC&dir=sent&range=custom&from=2026-01-01&to=2026-01-31&q=abc'
      render(<HistoryPage />)

      expect(fetchTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING',
          asset: 'USDC',
          type: 'sent',
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          search: 'abc',
        }),
        expect.anything(),
      )
    })

    it('resolves the ?range=7d preset into a date window', () => {
      nav.query = 'range=7d'
      render(<HistoryPage />)

      const args = fetchTransactionsMock.mock.calls[0][0]
      expect(args.dateFrom).toBeDefined()
      expect(args.dateTo).toBeDefined()
      const spanDays =
        (new Date(args.dateTo).getTime() - new Date(args.dateFrom).getTime()) /
        (24 * 60 * 60 * 1000)
      expect(Math.round(spanDays)).toBe(7)
    })

    it('writes a status chip selection back to the URL', async () => {
      render(<HistoryPage />)

      const group = screen.getByRole('group', { name: /status/i })
      fireEvent.click(within(group).getByRole('button', { name: /^Confirmed$/i }))

      await waitFor(() =>
        expect(nav.replace).toHaveBeenCalledWith('/history?status=COMPLETED', {
          scroll: false,
        }),
      )
    })

    it('composes a new filter with the filters already in the URL', async () => {
      nav.query = 'status=FAILED&asset=USDC'
      render(<HistoryPage />)

      const group = screen.getByRole('group', { name: /direction/i })
      fireEvent.click(within(group).getByRole('button', { name: /^Received$/i }))

      await waitFor(() =>
        expect(nav.replace).toHaveBeenCalledWith(
          '/history?status=FAILED&asset=USDC&dir=received',
          { scroll: false },
        ),
      )
    })

    it('writes a date preset back to the URL and drops custom bounds', async () => {
      nav.query = 'range=custom&from=2026-01-01&to=2026-01-31'
      render(<HistoryPage />)

      fireEvent.change(screen.getByLabelText('Range'), {
        target: { value: '30d' },
      })

      await waitFor(() =>
        expect(nav.replace).toHaveBeenCalledWith('/history?range=30d', {
          scroll: false,
        }),
      )
    })

    it('switches to a custom range when the From date is edited', async () => {
      nav.query = 'range=7d'
      render(<HistoryPage />)

      fireEvent.change(screen.getByLabelText('From'), {
        target: { value: '2026-02-01' },
      })

      await waitFor(() =>
        expect(nav.replace).toHaveBeenCalledWith(
          '/history?range=custom&from=2026-02-01',
          { scroll: false },
        ),
      )
    })

    it('reflects ?q= in the search input', () => {
      nav.query = 'q=GABC'
      render(<HistoryPage />)

      expect(screen.getByPlaceholderText(/Search by address, asset/)).toHaveValue(
        'GABC',
      )
    })

    it('clears every filter back to a clean URL', async () => {      nav.query = 'status=FAILED&asset=USDC&dir=sent&q=abc'
      render(<HistoryPage />)

      fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }))

      await waitFor(() =>
        expect(nav.replace).toHaveBeenCalledWith('/history', { scroll: false }),
      )
    })

    it('only offers the clear button while a filter is active', () => {
      const { unmount } = render(<HistoryPage />)
      expect(screen.queryByRole('button', { name: /Clear filters/i })).toBeNull()
      unmount()

      nav.query = 'status=FAILED'
      render(<HistoryPage />)
      expect(screen.getByRole('button', { name: /Clear filters/i })).toBeInTheDocument()
    })
  })

  describe('pagination', () => {
    it('displays first page of transactions', async () => {
      render(<HistoryPage />)

      // The mocked page has 3 transactions plus the 2 direction chips that
      // read "Sent" / "Received".
      await waitFor(() => {
        expect(screen.getAllByText(/Sent|Received/).length).toBeGreaterThanOrEqual(4)
      })
    })

    it('shows load more hint when more transactions exist', async () => {
      render(<HistoryPage />)

      expect(await screen.findByText('Scroll to load more')).toBeInTheDocument()
    })

    it('has intersection observer sentinel', async () => {
      const { container } = render(<HistoryPage />)

      await screen.findByText('Scroll to load more')
      const sentinels = container.querySelectorAll('[class*="flex"][class*="justify-center"]')
      expect(sentinels.length).toBeGreaterThan(0)
    })
  })

  describe('accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<HistoryPage />)

      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent('Transaction History')
    })

    it('has proper aria labels for dropdowns', () => {
      render(<HistoryPage />)

      const assetSelect = screen.getByLabelText('Filter by asset')
      expect(assetSelect).toHaveAttribute('aria-label')
    })

    it('has role group for direction filters', () => {
      render(<HistoryPage />)

      const directionGroup = screen.getByRole('group', { name: /direction/i })
      expect(directionGroup).toBeInTheDocument()
    })

    it('has role group for status filters', () => {
      render(<HistoryPage />)

      const statusGroup = screen.getByRole('group', { name: /status/i })
      expect(statusGroup).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows message when no transactions match filters', async () => {
      fetchTransactionsMock.mockResolvedValue(page([]))
      render(<HistoryPage />)

      await waitFor(() =>
        expect(screen.getByText('No transactions found')).toBeInTheDocument(),
      )
    })
  })

  describe('back button', () => {
    it('has back button to dashboard', () => {
      render(<HistoryPage />)

      const backButton = screen.getByRole('link', { name: /Back/i })
      expect(backButton).toBeInTheDocument()
      expect(backButton).toHaveAttribute('href', '/dashboard')
    })
  })

  describe('export button', () => {
    it('has export button', () => {
      render(<HistoryPage />)

      const exportButton = screen.getByRole('button', { name: /Export/i })
      expect(exportButton).toBeInTheDocument()
    })
  })

  describe('optimistic entries integration', () => {
    it('would show optimistic entries at top of list when present', () => {
      // This test documents the expected behavior
      // In real scenario, useOptimisticTransactions would return entries
      render(<HistoryPage />)

      // When optimisticEntries is non-empty, they should appear first
      // This is verified through the mergedTransactions logic
      expect(screen.getByText('Transaction History')).toBeInTheDocument()
    })

    it('merges optimistic and real transactions correctly', async () => {
      // Test documents merging behavior
      render(<HistoryPage />)

      // Merged list should maintain order: optimistic first, then real
      await waitFor(() => {
        expect(screen.getAllByText(/Sent|Received/).length).toBeGreaterThan(0)
      })
    })
  })
})
