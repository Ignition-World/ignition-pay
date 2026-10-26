import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CameraPermissionDialog } from '../components/camera-permission-dialog'

afterEach(cleanup)

describe('CameraPermissionDialog (#859)', () => {
  it('is a labelled, described modal dialog', () => {
    render(
      <CameraPermissionDialog open state="prompt" onOpenChange={vi.fn()} onRequestAccess={vi.fn()} />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Allow camera access' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/scan a QR code/i)
  })

  it('announces the permission state in a live region', () => {
    render(
      <CameraPermissionDialog open state="denied" onOpenChange={vi.fn()} onRequestAccess={vi.fn()} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/denied/i)
  })

  it('lets keyboard users request access', () => {
    const onRequestAccess = vi.fn()
    render(
      <CameraPermissionDialog
        open
        state="prompt"
        onOpenChange={vi.fn()}
        onRequestAccess={onRequestAccess}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /allow camera/i }))
    expect(onRequestAccess).toHaveBeenCalledTimes(1)
  })

  it('hides the allow action when no camera exists', () => {
    render(
      <CameraPermissionDialog
        open
        state="unavailable"
        onOpenChange={vi.fn()}
        onRequestAccess={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /allow camera|try again/i })).toBeNull()
  })
})
