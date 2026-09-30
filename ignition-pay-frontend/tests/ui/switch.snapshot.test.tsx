import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { Switch } from '@/components/ui/switch'

describe('Switch Component Snapshots', () => {
  it('renders unchecked switch', () => {
    const { container } = render(<Switch />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders checked switch', () => {
    const { container } = render(<Switch defaultChecked />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders disabled switch', () => {
    const { container } = render(<Switch disabled />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders switch with aria-label', () => {
    const { container } = render(<Switch aria-label="Toggle feature" />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
