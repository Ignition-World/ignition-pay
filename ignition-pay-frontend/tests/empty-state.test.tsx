import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from '../components/empty-state'

describe('EmptyState', () => {
  afterEach(cleanup)

  it('renders an SVG illustration, heading, description and CTA', () => {
    const { container } = render(
      <EmptyState
        illustration="history"
        title="No transactions yet"
        description="Once you send or receive an asset, your activity will show up here."
        action={{ label: 'Start by receiving assets', href: '/receive' }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'No transactions yet' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Once you send or receive an asset, your activity will show up here.',
      ),
    ).toBeInTheDocument()

    const cta = screen.getByRole('link', { name: 'Start by receiving assets' })
    expect(cta).toHaveAttribute('href', '/receive')

    // Illustrations must be inline SVG, not raster images, and decorative.
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('omits the CTA when no action is provided', () => {
    render(
      <EmptyState
        illustration="send"
        title="New to sending payments?"
        description="Paste a Stellar address to get started."
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'New to sending payments?' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
