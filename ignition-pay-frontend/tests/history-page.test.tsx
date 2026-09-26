import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from '../features/history/widgets/HistoryPage'
import { ToastProvider } from '../components/ui/toast'
import { fetchTransactions } from '@/features/history/services'
import type { Transaction } from '../features/history/models'

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
    vi.mocked(fetchTransactions).mockReset()
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
})
