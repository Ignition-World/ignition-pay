import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button Component Snapshots', () => {
  it('renders default button', () => {
    const { container } = render(<Button>Default</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders outline variant', () => {
    const { container } = render(<Button variant="outline">Outline</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders secondary variant', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders ghost variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders destructive variant', () => {
    const { container } = render(<Button variant="destructive">Destructive</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders link variant', () => {
    const { container } = render(<Button variant="link">Link</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders small size', () => {
    const { container } = render(<Button size="sm">Small</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders large size', () => {
    const { container } = render(<Button size="lg">Large</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders icon size', () => {
    const { container } = render(<Button size="icon">Icon</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders disabled button', () => {
    const { container } = render(<Button disabled>Disabled</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })
})
