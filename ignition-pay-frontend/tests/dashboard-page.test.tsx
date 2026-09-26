import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardPage } from '../features/dashboard/widgets/DashboardPage'
import { parseWalletSnapshot } from '../features/dashboard/services'
import { LanguageProvider } from '../lib/i18n'

function renderDashboard() {
  return render(
    <LanguageProvider>
      <DashboardPage />
    </LanguageProvider>,
  )
}

describe('DashboardPage', () => {
  afterEach(cleanup)

  it('groups balances by asset kind and renders a card per asset', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Native')).toBeInTheDocument())

    expect(screen.getByText('Stablecoins')).toBeInTheDocument()
    expect(screen.getByText('Other assets')).toBeInTheDocument()
    expect(screen.getByText('XLM')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('AQUA')).toBeInTheDocument()
  })

  it('exposes a refresh control and the last-updated time', async () => {
    renderDashboard()

    await waitFor(() => expect(screen.getByText(/Updated/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeEnabled()
  })

  it('draws a sparkline for each asset with value history', async () => {
    renderDashboard()

    await waitFor(() =>
      expect(screen.getByRole('img', { name: /XLM value over the last 7 days/ })).toBeInTheDocument(),
    )
  })
})

describe('parseWalletSnapshot', () => {
  it('maps Horizon-style balances into dashboard assets', () => {
    const snapshot = parseWalletSnapshot('GADDRESS', {
      balances: [
        { assetType: 'native', balance: '100' },
        { assetType: 'credit_alphanum4', assetCode: 'USDC', assetIssuer: 'GISSUER', balance: '25.5' },
      ],
    })

    expect(snapshot.address).toBe('GADDRESS')
    expect(snapshot.assets).toHaveLength(2)
    expect(snapshot.assets[0]).toMatchObject({ code: 'XLM', issuer: 'native', balance: 100 })
    expect(snapshot.assets[1]).toMatchObject({ code: 'USDC', issuer: 'GISSUER', value: 25.5 })
  })

  it('skips balances without a resolvable asset code', () => {
    const snapshot = parseWalletSnapshot('GADDRESS', {
      balances: [{ assetType: 'liquidity_pool_shares', balance: '1' }],
    })

    expect(snapshot.assets).toEqual([])
  })

  it('rejects a response without a balances array', () => {
    expect(() => parseWalletSnapshot('GADDRESS', {})).toThrow(/Unexpected balance response/)
  })
})
