import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Notifications')).toBeInTheDocument())

    // #668 — the shortcut configuration section lives on this page.
    expect(
      screen.getByRole('heading', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
  })
})
