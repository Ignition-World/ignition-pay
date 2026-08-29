import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SendPage } from '../features/send/widgets/SendPage'
import * as sendServices from '@/features/send/services'

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

vi.mock('@/features/send/services', async () => {
  const actual = await vi.importActual<typeof import('@/features/send/services')>('@/features/send/services')
  return {
    ...actual,
    checkTrustline: vi.fn(() => Promise.resolve({ status: 'ok' as const })),
    estimateTransactionFee: vi.fn(() =>
      Promise.resolve({
        feeInXlm: 0.000035,
        feeInStroops: 350,
        formattedFee: '0.000035 XLM',
        baseFeeInStroops: 350,
        operationCount: 1,
        isDynamic: true,
        source: 'horizon' as const,
      }),
    ),
  }
})

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

describe('SendPage dynamic network fee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('fetches and renders the dynamic network fee in the review step', async () => {
    render(<SendPage />)

    // Fill form
    const recipientInput = screen.getByLabelText('Recipient Address')
    fireEvent.change(recipientInput, { target: { value: VALID_ADDRESS } })

    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '10' } })

    // Click Review Payment
    const submitButton = screen.getByRole('button', { name: /review payment/i })
    fireEvent.click(submitButton)

    // Verify Review step is displayed
    await waitFor(() => {
      expect(screen.getByText('Review Payment')).toBeInTheDocument()
    })

    // Verify estimateTransactionFee was called
    expect(sendServices.estimateTransactionFee).toHaveBeenCalled()

    // Verify dynamic fee is displayed instead of hardcoded 0.00001 XLM
    await waitFor(() => {
      expect(screen.getByText('0.000035 XLM')).toBeInTheDocument()
    })
  })

  it('renders fallback fee if estimation returns standard fee', async () => {
    vi.mocked(sendServices.estimateTransactionFee).mockResolvedValueOnce({
      feeInXlm: 0.00001,
      feeInStroops: 100,
      formattedFee: '0.00001 XLM',
      baseFeeInStroops: 100,
      operationCount: 1,
      isDynamic: false,
      source: 'fallback',
    })

    render(<SendPage />)

    const recipientInput = screen.getByLabelText('Recipient Address')
    fireEvent.change(recipientInput, { target: { value: VALID_ADDRESS } })

    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '10' } })

    const submitButton = screen.getByRole('button', { name: /review payment/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Review Payment')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('0.00001 XLM')).toBeInTheDocument()
    })
  })
})
