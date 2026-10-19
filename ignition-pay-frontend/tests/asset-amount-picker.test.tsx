import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { AssetAmountPicker } from '../components/asset-amount-picker'
import type { SendableAsset } from '../features/send/models'

const xlm: SendableAsset = { code: 'XLM', issuer: 'native', balance: 10, reserved: 1 }

function PickerHarness() {
  const [amount, setAmount] = useState('')
  return (
    <AssetAmountPicker
      assets={[xlm]}
      selectedCode="XLM"
      amount={amount}
      onAssetChange={() => {}}
      onAmountChange={setAmount}
    />
  )
}

afterEach(cleanup)

describe('AssetAmountPicker precision feedback', () => {
  it('keeps over-precision input visible and explains why it cannot be sent', () => {
    render(<PickerHarness />)
    const amountInput = screen.getByLabelText('Amount')

    fireEvent.change(amountInput, { target: { value: '0.00000001' } })

    expect(amountInput).toHaveValue('0.00000001')
    expect(amountInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Stellar supports up to 7 decimal places.')).toBeInTheDocument()
  })

  it('accepts XLM precision up to one stroop', () => {
    render(<PickerHarness />)
    const amountInput = screen.getByLabelText('Amount')

    fireEvent.change(amountInput, { target: { value: '0.0000001' } })

    expect(amountInput).toHaveValue('0.0000001')
    expect(amountInput).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('Stellar supports up to 7 decimal places.')).not.toBeInTheDocument()
  })
})
