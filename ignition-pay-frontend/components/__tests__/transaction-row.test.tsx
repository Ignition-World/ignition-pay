import '@testing-library/jest-dom/vitest'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactionRow } from '../transaction-row'
import type { Transaction, OptimisticTransaction } from '@/features/history/models'

describe('TransactionRow', () => {
  describe('real transactions', () => {
    it('renders sent transaction correctly', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100.5,
        recipient: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
        timestamp: new Date('2024-01-01T12:00:00Z'),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/Sent XLM/)).toBeInTheDocument()
      expect(screen.getByText(/GBJC.*ZPWP/)).toBeInTheDocument()
      expect(screen.getByText(/100\.5000/)).toBeInTheDocument()
      expect(screen.getByText(/Jan 1.*12:00/)).toBeInTheDocument()
    })

    it('renders received transaction correctly', () => {
      const tx: Transaction = {
        id: 'tx-2',
        type: 'received',
        asset: 'USDC',
        amount: 250.75,
        recipient: 'GAJDLFWC3H2LMYMVLYWE3MID4YSKKFVDBMPUEPBJ4PBGQRGKQTKJLXDX',
        timestamp: new Date('2024-01-02T14:30:00Z'),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/Received USDC/)).toBeInTheDocument()
      expect(screen.getByText(/GAJD.*JLXDX/)).toBeInTheDocument()
      expect(screen.getByText(/250\.7500/)).toBeInTheDocument()
    })

    it('abbreviates recipient address correctly', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
        timestamp: new Date(),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      // Shows first 6 + '...' + last 4 = 'GBJCHU...ZPWP'
      expect(screen.getByText('GBJCHU...ZPWP')).toBeInTheDocument()
    })

    it('formats transaction amount with 4 decimal places', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 123.456789,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/123\.4568/)).toBeInTheDocument()
    })

    it('shows negative sign for sent transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/-100\./)).toBeInTheDocument()
    })

    it('shows positive sign for received transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'received',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/\+100\./)).toBeInTheDocument()
    })

    it('does not show status badge for confirmed transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'confirmed',
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.queryByText('Pending...')).not.toBeInTheDocument()
      expect(screen.queryByText('Pending')).not.toBeInTheDocument()
    })

    it('shows pending status badge for pending transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
      }

      render(<TransactionRow transaction={tx} />)

      const badge = screen.getByText('Pending')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('bg-yellow-500/20', 'text-yellow-500')
    })

    it('shows processing status badge for processing transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'processing',
      }

      render(<TransactionRow transaction={tx} />)

      const badge = screen.getByText('Processing')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('bg-blue-500/20', 'text-blue-500')
    })

    it('shows completed status badge for completed transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'completed',
      }

      render(<TransactionRow transaction={tx} />)

      const badge = screen.getByText('Completed')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('bg-green-500/20', 'text-green-500')
    })

    it('shows failed status badge for failed transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'failed',
      }

      render(<TransactionRow transaction={tx} />)

      const badge = screen.getByText('Failed')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('bg-red-500/20', 'text-red-500')
    })

    it('shows refunded status badge for refunded transactions', () => {
      const tx: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'refunded',
      }

      render(<TransactionRow transaction={tx} />)

      const badge = screen.getByText('Refunded')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('bg-purple-500/20', 'text-purple-500')
    })
  })

  describe('optimistic transactions', () => {
    it('renders optimistic transaction with spinner', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 50,
        recipient: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/Sent XLM/)).toBeInTheDocument()
      expect(screen.getByText('Pending...')).toBeInTheDocument()
    })

    it('shows loading spinner for optimistic entries', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'received',
        asset: 'USDC',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      const { container } = render(<TransactionRow transaction={tx} />)

      // Check for spinner animation
      const spinnerContainer = screen.getByText('Pending...')
      expect(spinnerContainer).toHaveAttribute('aria-live', 'polite')
      expect(spinnerContainer).toHaveAttribute('aria-label')
    })

    it('has aria-live attribute for screen reader updates', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 50,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      render(<TransactionRow transaction={tx} />)

      const statusBadge = screen.getByText('Pending...')
      expect(statusBadge).toHaveAttribute('aria-live', 'polite')
    })

    it('has accessibility label for optimistic entry', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 50,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      render(<TransactionRow transaction={tx} />)

      const statusBadge = screen.getByText('Pending...')
      expect(statusBadge).toHaveAttribute('aria-label')
    })

    it('applies yellow styling to optimistic entries', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 50,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      const { container } = render(<TransactionRow transaction={tx} />)

      // Check for yellow styling classes
      const row = container.firstChild
      expect(row).toHaveClass('bg-yellow-500/5')
      expect(row).toHaveClass('border-yellow-500/30')
    })

    it('applies reduced opacity to optimistic icon', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 50,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      const { container } = render(<TransactionRow transaction={tx} />)

      // Check for opacity class on icon container
      const iconContainer = container.querySelector('.w-12.h-12')
      expect(iconContainer).toHaveClass('opacity-60')
    })

    it('displays optimistic entry with correct amount', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 123.4567,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/123\.4567/)).toBeInTheDocument()
    })

    it('handles optimistic entry recipient address', () => {
      const tx: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'received',
        asset: 'USDC',
        amount: 100,
        recipient: 'GAJDLFWC3H2LMYMVLYWE3MID4YSKKFVDBMPUEPBJ4PBGQRGKQTKJLXDX',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      render(<TransactionRow transaction={tx} />)

      expect(screen.getByText(/GAJD.*JLXDX/)).toBeInTheDocument()
    })
  })

  describe('styling differences', () => {
    it('shows different styling for optimistic vs real pending', () => {
      const realPending: Transaction = {
        id: 'tx-1',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
      }

      const { container: realContainer } = render(
        <TransactionRow transaction={realPending} />,
      )

      const optimistic: OptimisticTransaction = {
        optimisticId: 'optimistic-123-abc',
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ...',
        timestamp: new Date(),
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }

      const { container: optimisticContainer } = render(
        <TransactionRow transaction={optimistic} />,
      )

      // Real pending: no background color, just yellow badge
      const realRow = realContainer.firstChild
      expect(realRow).toHaveClass('border-transparent')

      // Optimistic: yellow background and border
      const optimisticRow = optimisticContainer.firstChild
      expect(optimisticRow).toHaveClass('bg-yellow-500/5')
      expect(optimisticRow).toHaveClass('border-yellow-500/30')
    })
  })
})
