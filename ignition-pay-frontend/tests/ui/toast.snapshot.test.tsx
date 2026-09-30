import '@testing-library/jest-dom/vitest'
import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { ToastProvider, Toaster } from '@/components/ui/toast'

describe('Toast Component Snapshots', () => {
  it('renders toaster viewport', () => {
    const { container } = render(
      <ToastProvider>
        <Toaster />
      </ToastProvider>
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders toaster with custom className', () => {
    const { container } = render(
      <ToastProvider>
        <Toaster className="top-4 bottom-auto" />
      </ToastProvider>
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})
