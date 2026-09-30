import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Input } from '@/components/ui/input'

describe('Input Component Snapshots', () => {
  it('renders default input', () => {
    const { container } = render(<Input placeholder="Enter text" />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders input with value', () => {
    const { container } = render(<Input defaultValue="Test value" />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders disabled input', () => {
    const { container } = render(<Input disabled />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders input with type', () => {
    const { container } = render(<Input type="email" />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
