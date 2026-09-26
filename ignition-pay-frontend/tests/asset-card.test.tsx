import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetCard } from '../components/asset-card'
import { badgeVariants } from '../components/ui/badge'

afterEach(() => {
  cleanup()
})

describe('badgeVariants (CVA)', () => {
  it('exposes typed variants via class-variance-authority', () => {
    expect(badgeVariants({ variant: 'default' })).toContain('bg-primary')
    expect(badgeVariants({ variant: 'success' })).toContain('text-green-600')
    expect(badgeVariants({ variant: 'destructive' })).toContain('text-destructive')
    expect(badgeVariants({ variant: 'warning' })).toContain('text-yellow-600')
    expect(badgeVariants({ variant: 'secondary' })).toContain('bg-secondary')
    expect(badgeVariants({ variant: 'outline' })).toContain('border-border')
  })

  it('falls back to the default variant when none is provided', () => {
    expect(badgeVariants()).toContain('bg-primary')
  })
})

describe('AssetCard', () => {
  const baseProps = {
    code: 'XLM',
    issuer: 'GBJCHUKZMTFSLOMNC7P4TS4VJJBTCYL3YCWKEANE7FCNHWHP6ZPWPX3',
    balance: 100.5,
    value: 12.34,
  }

  it('renders asset details without a change badge when change24h is omitted', () => {
    render(<AssetCard {...baseProps} />)

    expect(screen.getByText('XLM')).toBeInTheDocument()
    expect(screen.getByText('100.5000')).toBeInTheDocument()
    expect(screen.getByText('$12.34')).toBeInTheDocument()
    expect(screen.queryByLabelText(/24 hour change/i)).not.toBeInTheDocument()
  })

  it('renders a success Badge for non-negative 24h change via CVA variants', () => {
    const { container } = render(<AssetCard {...baseProps} change24h={5.25} />)

    const badge = screen.getByLabelText(/24 hour change up 5.25 percent/i)
    expect(badge).toHaveTextContent('+5.25%')
    expect(badge).toHaveAttribute('data-slot', 'badge')
    expect(badge.className).toMatch(/text-green-600|bg-green-500/)
    // No inline ternary class map left on a raw div for the change chip
    expect(container.querySelector('div.text-green-500')).toBeNull()
  })

  it('renders a destructive Badge for negative 24h change via CVA variants', () => {
    render(<AssetCard {...baseProps} change24h={-2.1} />)

    const badge = screen.getByLabelText(/24 hour change down 2.10 percent/i)
    expect(badge).toHaveTextContent('-2.10%')
    expect(badge).toHaveAttribute('data-slot', 'badge')
    expect(badge.className).toMatch(/text-destructive|bg-destructive/)
  })

  it('masks balances when hideAmounts is true', () => {
    render(<AssetCard {...baseProps} change24h={1} hideAmounts />)

    expect(screen.queryByText('100.5000')).not.toBeInTheDocument()
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument()
  })
})
