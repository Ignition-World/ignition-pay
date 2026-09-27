import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TransactionRow } from '../components/transaction-row'
import {
  mergeOptimisticTransactions,
  type OptimisticTransaction,
  type Transaction,
} from '../features/history/models'
import { LanguageProvider } from '../lib/i18n'

afterEach(cleanup)

const RECIPIENT = 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3'

function optimistic(
  overrides: Partial<OptimisticTransaction> = {},
): OptimisticTransaction {
  const submittedAt = Date.now()
  return {
    optimisticId: 'optimistic-1',
    status: 'pending',
    submittedAt,
    type: 'sent',
    asset: 'XLM',
    amount: 25,
    recipient: RECIPIENT,
    timestamp: new Date(submittedAt),
    isOptimistic: true,
    ...overrides,
  }
}

function real(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'real-1',
    type: 'sent',
    asset: 'XLM',
    amount: 25,
    recipient: RECIPIENT,
    timestamp: new Date(),
    status: 'confirmed',
    ...overrides,
  } as Transaction
}

function renderRow(transaction: Transaction | OptimisticTransaction) {
  return render(
    <LanguageProvider>
      <TransactionRow transaction={transaction} />
    </LanguageProvider>,
  )
}

/**
 * Issue #626 — optimistic send confirmation.
 *
 * The submit path already added a pending entry and removed it on failure with a
 * toast. What was missing was the middle criterion: on success the entry was
 * *deleted*, so the row the user had just watched appear vanished again, because
 * the server's copy only shows up on the next fetch. The badge therefore never
 * visibly changed from Pending to Confirmed.
 */
describe('mergeOptimisticTransactions', () => {
  it('puts optimistic entries first', () => {
    const merged = mergeOptimisticTransactions(
      [real({ id: 'a' })],
      [optimistic({ optimisticId: 'o', amount: 999 })],
    )

    expect(merged).toHaveLength(2)
    expect('optimisticId' in merged[0]).toBe(true)
  })

  it('drops an optimistic entry once the server copy arrives', () => {
    const entry = optimistic()
    const serverCopy = real({ timestamp: new Date(entry.submittedAt + 5_000) })

    const merged = mergeOptimisticTransactions([serverCopy], [entry])

    // Exactly one row: the real one. This is what stops a duplicate.
    expect(merged).toHaveLength(1)
    expect('optimisticId' in merged[0]).toBe(false)
  })

  it('keeps a confirmed optimistic entry until the server copy arrives', () => {
    const entry = optimistic({ status: 'confirmed', confirmedAt: Date.now() })

    const merged = mergeOptimisticTransactions([], [entry])

    expect(merged).toHaveLength(1)
    expect('optimisticId' in merged[0]).toBe(true)
  })

  it('does not treat a different payment as the server copy', () => {
    const entry = optimistic()

    expect(
      mergeOptimisticTransactions([real({ amount: 26 })], [entry]),
    ).toHaveLength(2)
    expect(
      mergeOptimisticTransactions([real({ asset: 'USDC' })], [entry]),
    ).toHaveLength(2)
    expect(
      mergeOptimisticTransactions([real({ recipient: 'GOTHER' })], [entry]),
    ).toHaveLength(2)
    expect(
      mergeOptimisticTransactions([real({ type: 'received' })], [entry]),
    ).toHaveLength(2)
  })

  it('does not match an identical payment from outside the time window', () => {
    const entry = optimistic()
    const muchLater = real({
      timestamp: new Date(entry.submittedAt + 11 * 60 * 1000),
    })

    // Same recipient, same amount, but far enough apart to be a separate send.
    expect(mergeOptimisticTransactions([muchLater], [entry])).toHaveLength(2)
  })

  it('passes the real list through untouched when there is nothing optimistic', () => {
    const list = [real({ id: 'a' }), real({ id: 'b' })]

    expect(mergeOptimisticTransactions(list, [])).toEqual(list)
  })

  it('handles both sides being empty', () => {
    expect(mergeOptimisticTransactions([], [])).toEqual([])
  })
})

describe('optimistic row badge', () => {
  it('shows a spinning pending badge while awaiting confirmation', () => {
    const { container } = renderRow(optimistic())

    expect(container.querySelector('.animate-spin')).not.toBeNull()
    // The pending badge carries its own dedicated label, not the generic one.
    expect(screen.queryByLabelText(/^Status: /)).toBeNull()
  })

  it('shows a settled status badge once confirmed', () => {
    const { container } = renderRow(
      optimistic({ status: 'confirmed', confirmedAt: Date.now() }),
    )

    // Same row, different badge: no spinner, and the generic status label.
    expect(container.querySelector('.animate-spin')).toBeNull()
    expect(screen.getByLabelText(/^Status: /)).toBeInTheDocument()
  })

  it('still marks the row as optimistic while confirmed', () => {
    const { container } = renderRow(
      optimistic({ status: 'confirmed', confirmedAt: Date.now() }),
    )

    // The row keeps its optimistic styling until the server copy replaces it,
    // so it stays visually distinct from a fetched transaction.
    expect(container.querySelector('.border-yellow-500\\/30')).not.toBeNull()
  })
})
