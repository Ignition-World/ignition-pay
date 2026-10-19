import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))
vi.mock('../components/navigation', () => ({ Navigation: () => null }))
vi.mock('../components/onboarding-tour', () => ({ OnboardingTour: () => null }))

import { AppWrapper } from '../components/app-wrapper'
import {
  notifyWalletNetworkChanged,
  subscribeToWalletNetworkChanges,
} from '../lib/wallet-network'

afterEach(cleanup)

describe('wallet network change (#877)', () => {
  it('delivers the new network to subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToWalletNetworkChanges(listener)

    notifyWalletNetworkChanged('TESTNET')
    expect(listener).toHaveBeenCalledWith({ network: 'TESTNET' })

    unsubscribe()
    notifyWalletNetworkChanged('PUBLIC')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('tells the user when the wallet switches network', () => {
    render(
      <AppWrapper>
        <p>page</p>
      </AppWrapper>,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => notifyWalletNetworkChanged('TESTNET'))

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your wallet switched to TESTNET. Balances were refreshed.',
    )
  })
})
