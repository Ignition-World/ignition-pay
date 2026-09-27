import { test, expect, type Page } from '@playwright/test'

/**
 * E2E: anchor deposit flow
 *   select anchor → choose asset → enter amount → confirm → success state
 *
 * All anchor API calls (SEP-38 quote, SEP-24 initiate/status/history) are
 * mocked with page.route so the test runs headless in CI without a backend.
 */

const ANCHOR = 'StellarX'
const AMOUNT = '100'
const ASSET = 'USD'

interface MockOptions {
  initiateFails?: boolean
}

async function mockAnchorApi(page: Page, opts: MockOptions = {}) {
  // Stateful history so we can assert the balance change after a deposit.
  const historyItems: Record<string, unknown>[] = []

  await page.route('**/api/anchors', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )

  await page.route('**/api/v1/sep24/history**', (route) =>
    route.fulfill({
      json: {
        items: historyItems,
        total: historyItems.length,
        page: 1,
        limit: 10,
      },
    }),
  )

  await page.route('**/api/v1/sep38/quote', (route) =>
    route.fulfill({
      json: {
        id: 'quote-1',
        sellAsset: ASSET,
        buyAsset: 'USDC',
        sellAmount: AMOUNT,
        buyAmount: '98.50',
        price: '0.985',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        fee: { total: '1.50', asset: ASSET },
      },
    }),
  )

  await page.route('**/api/v1/sep24/initiate', (route) => {
    if (opts.initiateFails) {
      return route.fulfill({
        status: 502,
        body: 'Anchor unavailable',
      })
    }
    return route.fulfill({
      json: {
        id: 'tx-1',
        anchorTxId: 'anchor-tx-1',
        interactiveUrl: 'about:blank',
        startedAt: new Date().toISOString(),
      },
    })
  })

  await page.route('**/api/v1/sep24/status', (route) => {
    historyItems.splice(0, historyItems.length, {
      id: 'tx-1',
      anchorName: ANCHOR,
      operation: 'deposit',
      assetCode: ASSET,
      amount: AMOUNT,
      status: 'completed',
      startedAt: new Date().toISOString(),
    })
    return route.fulfill({
      json: {
        id: 'tx-1',
        anchorTxId: 'anchor-tx-1',
        status: 'completed',
        amountOut: '98.50',
        stellarTxHash: 'abcdef0123456789abcdef0123456789',
        startedAt: new Date().toISOString(),
      },
    })
  })
}

async function fillDepositForm(page: Page) {
  await page.goto('/anchors')

  // Select anchor
  const anchorCard = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: ANCHOR, exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Deposit' }) })
    .last()
  await anchorCard.getByRole('button', { name: 'Deposit' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`Deposit via ${ANCHOR}`)

  // Choose asset
  await dialog.getByRole('button', { name: new RegExp(`^${ASSET}\\b`) }).click()

  // Enter amount
  await dialog.getByPlaceholder('0.00').fill(AMOUNT)
  await dialog.getByRole('button', { name: `Continue to ${ANCHOR}` }).click()

  // Quote step
  await expect(dialog).toContainText('Quote Received')
  return dialog
}

test.describe('Anchor deposit flow', () => {
  test('completes a deposit and reflects the balance change', async ({ page }) => {
    await mockAnchorApi(page)

    // Empty history before the deposit
    await page.goto('/anchors')
    await expect(page.getByText('No anchor transactions yet')).toBeVisible()

    const dialog = await fillDepositForm(page)
    await dialog.getByRole('button', { name: 'Confirm & Continue' }).click()

    // Success state
    await expect(dialog.getByText('Deposit Complete')).toBeVisible()
    await expect(dialog).toContainText(
      `Your deposit of ${AMOUNT} ${ASSET} via ${ANCHOR} was successful.`,
    )
    await expect(dialog).toContainText('98.50')

    await dialog.getByRole('button', { name: 'Done' }).click()

    // Balance change: history now shows the +100 USD credit
    await page.getByRole('button', { name: 'Refresh history' }).click()
    await expect(page.getByText(`+${AMOUNT} ${ASSET}`)).toBeVisible()
    await expect(page.getByText('No anchor transactions yet')).toHaveCount(0)
  })

  test('shows an error state when the deposit fails', async ({ page }) => {
    await mockAnchorApi(page, { initiateFails: true })

    const dialog = await fillDepositForm(page)
    await dialog.getByRole('button', { name: 'Confirm & Continue' }).click()

    await expect(dialog.getByText('Something went wrong')).toBeVisible()
    await expect(dialog).toContainText('Anchor unavailable')
    await expect(dialog.getByText('Deposit Complete')).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Close' }).first().click()

    // No balance change recorded
    await expect(page.getByText(`+${AMOUNT} ${ASSET}`)).toHaveCount(0)
  })
})
