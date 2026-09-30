import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge Component Snapshots', () => {
  it('renders default badge', () => {
    const { container } = render(<Badge>Default</Badge>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders success variant', () => {
    const { container } = render(<Badge variant="success">Success</Badge>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders warning variant', () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Destructive</Badge>)
    expect(container.firstChild).toMatchSnapshot()
  })
})
