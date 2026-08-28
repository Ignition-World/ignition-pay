import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SendPage } from '../features/send/widgets/SendPage'

vi.mock('@/lib/stellar/strkey', () => ({
  validateStellarAddress: vi.fn((addr: string) => ({
    isValid: addr.startsWith('G') && addr.length > 50,
    kind: 'publicKey' as const,
  })),
}))

vi.mock('@/lib/stellar/memo', () => ({
  MEMO_TYPES: ['none', 'text', 'id', 'hash'],
  MEMO_TYPE_LABELS: { none: 'None', text: 'Text', id: 'ID', hash: 'Hash' },
  MEMO_TYPE_HINTS: { none: 'No memo', text: 'Text memo', id: 'ID memo', hash: 'Hash memo' },
  MEMO_TEXT_MAX_BYTES: 28,
  memoByteLength: (memo: string) => new TextEncoder().encode(memo).length,
  validateMemo: vi.fn(() => ({ isValid: true })),
}))

vi.mock('@/features/send/services', () => ({
  checkTrustline: vi.fn(() => Promise.resolve({ status: 'ok' as const })),
}))

vi.mock('@/features/history/state', () => ({
  useOptimisticTransactions: () => ({
    optimisticEntries: [],
    addOptimisticEntry: vi.fn(() => 'optimistic-test-id'),
    reconcileEntry: vi.fn(),
    removeOptimisticEntry: vi.fn(),
  }),
}))

const toastAdd = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}))

const VALID_ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'

describe('SendPage recipient paste button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a paste-from-clipboard button next to the recipient field', () => {
    render(<SendPage />)

    expect(screen.getByRole('button', { name: /paste from clipboard/i })).toBeInTheDocument()
  })

  it('fills the recipient field with clipboard contents when clicked', async () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue(VALID_ADDRESS) },
    })

    render(<SendPage />)

    fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }))

    const recipientInput = screen.getByLabelText('Recipient Address') as HTMLInputElement
    await waitFor(() => expect(recipientInput.value).toBe(VALID_ADDRESS))
  })

  it('trims whitespace from pasted content', async () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue(`  ${VALID_ADDRESS}  \n`) },
    })

    render(<SendPage />)

    fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }))

    const recipientInput = screen.getByLabelText('Recipient Address') as HTMLInputElement
    await waitFor(() => expect(recipientInput.value).toBe(VALID_ADDRESS))
  })

  it('ignores an empty clipboard without touching the field', async () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('   ') },
    })

    render(<SendPage />)

    fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }))

    const recipientInput = screen.getByLabelText('Recipient Address') as HTMLInputElement
    await waitFor(() => expect(recipientInput.value).toBe(''))
  })

  it('shows a toast when clipboard permission is denied', async () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    render(<SendPage />)

    fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }))

    await waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Paste failed' }),
      ),
    )
  })

  it('shows a toast when the Clipboard API is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<SendPage />)

    fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }))

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Clipboard unavailable' }),
    )
  })

  it('does not submit the form when the paste button is clicked', async () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue(VALID_ADDRESS) },
    })

    render(<SendPage />)

    fireEvent.click(screen.getByRole('button', { name: /paste from clipboard/i }))
    await waitFor(() =>
      expect((screen.getByLabelText('Recipient Address') as HTMLInputElement).value).toBe(
        VALID_ADDRESS,
      ),
    )

    // Still on the form step — a submit would have advanced to the review
    // step, which renders a "Back to Edit" button that only exists there.
    expect(screen.getByText('Recipient Address')).toBeInTheDocument()
    expect(screen.queryByText('Back to Edit')).not.toBeInTheDocument()
  })
})
