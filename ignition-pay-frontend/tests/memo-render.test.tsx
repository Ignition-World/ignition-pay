import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetCard } from '../components/asset-card'
import { WalletCard } from '../components/wallet-card'
import { LanguageProvider } from '../lib/i18n'
import type { AssetBalance } from '../features/dashboard/models'

/**
 * #672 — the dashboard re-renders on every balance poll, so a card whose props
 * did not change must not run its render body again. These tests pass a stand-in
 * "number" whose `toFixed` counts invocations: the card only calls it while
 * rendering, so the count is exactly the number of times the body ran.
 */
afterEach(cleanup)

function countedNumber(value: number) {
  const track = { calls: 0 }
  const num = {
    toFixed: (digits: number) => {
      track.calls += 1
      return value.toFixed(digits)
    },
  } as unknown as number
  return { num, track }
}

/** Rebuilds the child element on every update, so props are fresh objects. */
function BumpHarness({ renderChild }: { renderChild: () => React.ReactNode }) {
  const [count, setCount] = useState(0)
  return (
    <>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        bump {count}
      </button>
      {renderChild()}
    </>
  )
}

describe('AssetCard memoization (#672)', () => {
  it('is wrapped in React.memo', () => {
    expect((AssetCard as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  it('does not run its render body when the parent updates with equal props', () => {
    const balance = countedNumber(100.5)
    const value = countedNumber(12.34)

    render(
      <BumpHarness
        renderChild={() => (
          <AssetCard
            code="XLM"
            issuer="native"
            balance={balance.num}
            value={value.num}
          />
        )}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))

    expect(balance.track.calls).toBe(1)
    expect(value.track.calls).toBe(1)
  })
})

describe('WalletCard memoization (#672)', () => {
  const history = [0.1, 0.2, 0.15]

  function walletAsset(asset: {
    balance: number
    value: number
  }): AssetBalance {
    return {
      code: 'XLM',
      issuer: 'native',
      balance: asset.balance,
      value: asset.value,
      change24h: 1.2,
      history,
    }
  }

  it('skips a render for a fresh object with unchanged fields', () => {
    const balance = countedNumber(100.5)
    const value = countedNumber(12.34)

    render(
      // The provider must sit outside the harness: a context value rebuilt on
      // every parent render would re-render the consumer and mask the memo.
      <LanguageProvider>
        <BumpHarness
          renderChild={() => (
            <WalletCard
              // A fresh object each render stands in for a poll that returns
              // unchanged data; the custom comparator should treat it as equal.
              asset={walletAsset({ balance: balance.num, value: value.num })}
            />
          )}
        />
      </LanguageProvider>,
    )

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))

    expect(balance.track.calls).toBe(1)
  })

  it('re-renders when a balance actually changes', () => {
    const first = countedNumber(100.5)
    const second = countedNumber(250)
    let balance = first.num

    render(
      <LanguageProvider>
        <BumpHarness
          renderChild={() => (
            <WalletCard asset={walletAsset({ balance, value: 12.34 })} />
          )}
        />
      </LanguageProvider>,
    )

    balance = second.num
    fireEvent.click(screen.getByRole('button'))

    expect(first.track.calls).toBe(1)
    expect(second.track.calls).toBe(1)
  })
})
