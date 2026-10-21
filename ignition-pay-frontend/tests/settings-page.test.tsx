import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../features/settings/widgets/SettingsPage'
import { LanguageProvider } from '../lib/i18n'

vi.mock('../features/settings/services', () => ({
  getApiBase: () => 'http://localhost:3000',
  fetchUserPreferences: vi.fn().mockResolvedValue({}),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../features/settings/services/api-keys', () => ({
  listApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  rotateApiKey: vi.fn(),
  finalizeApiKeyRotation: vi.fn(),
  cancelApiKeyRotation: vi.fn(),
  revokeApiKey: vi.fn(),
}))

afterEach(cleanup)

describe('SettingsPage', () => {
  it('renders every settings section, including keyboard shortcuts', async () => {
    render(
      <LanguageProvider>
        <SettingsPage />
      </LanguageProvider>,
    )

    // Section names appear in both the desktop and mobile navs (and as headings).
    expect(screen.getAllByText('Account').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Security').length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(screen.getAllByText('Notifications').length).toBeGreaterThan(0),
    )

    // #668 — the shortcut configuration section lives on this page.
    expect(
      screen.getByRole('heading', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Preferences').length).toBeGreaterThan(0)
  })

  // #883 — A/B assignments are per user and must be purged on sign-out so the
  // next account does not inherit the previous one's experiments.
  it('clears persisted A/B state when the user signs out', async () => {
    window.localStorage.setItem(
      'ignition-pay:ab:variant:dashboard-asset-layout:someone',
      'grid-compact',
    )
    window.localStorage.setItem('ignition-pay:ab:user-id', 'anon-123')

    render(
      <LanguageProvider>
        <SettingsPage />
      </LanguageProvider>,
    )

    fireEvent.click(screen.getByTestId('settings-signout-button'))

    expect(
      window.localStorage.getItem('ignition-pay:ab:variant:dashboard-asset-layout:someone'),
    ).toBeNull()
    expect(window.localStorage.getItem('ignition-pay:ab:user-id')).toBeNull()
  })
})
