import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysSection } from '../features/settings/widgets/ApiKeysSection'

const API_BASE = 'http://localhost:3000'

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response
}

describe('ApiKeysSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders API keys returned by the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          apiKeys: [
            {
              id: 'key-1',
              name: 'Production Key',
              prefix: 'sk_12345678',
              scope: 'read',
              isActive: true,
              status: 'active',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              lastUsedAt: '2026-01-02T00:00:00.000Z',
              expiresAt: null,
              rotationOfId: null,
              rotationExpiresAt: null,
            },
          ],
        }),
      ),
    )

    render(<ApiKeysSection />)

    await waitFor(() =>
      expect(screen.getByText('Production Key')).toBeInTheDocument(),
    )
    expect(screen.getByText(/sk_12345678/)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()

    const expectedUrl = `${API_BASE}/api/v1/api-keys`
    expect(fetch).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('shows an empty state when no keys exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ apiKeys: [] })),
    )

    render(<ApiKeysSection />)

    await waitFor(() =>
      expect(screen.getByText(/No API keys yet/)).toBeInTheDocument(),
    )
  })

  it('creates a key and reveals the raw key once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ apiKeys: [] })) // initial list
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'key-new',
          key: 'sk_newrawkey',
          prefix: 'sk_newrawke',
          scope: 'read',
          createdAt: '2026-01-03T00:00:00.000Z',
        }),
      ) // POST create
      .mockResolvedValueOnce(
        jsonResponse({
          apiKeys: [
            {
              id: 'key-new',
              name: 'My Custom Key',
              prefix: 'sk_newrawke',
              scope: 'read',
              isActive: true,
              status: 'active',
              createdAt: '2026-01-03T00:00:00.000Z',
              updatedAt: '2026-01-03T00:00:00.000Z',
              lastUsedAt: null,
              expiresAt: null,
              rotationOfId: null,
              rotationExpiresAt: null,
            },
          ],
        }),
      ) // refresh after create
    vi.stubGlobal('fetch', fetchMock)

    render(<ApiKeysSection />)

    await waitFor(() =>
      expect(screen.getByText(/No API keys yet/)).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Create Key/i }))

    const nameInput = await screen.findByLabelText('API key name')
    fireEvent.change(nameInput, { target: { value: 'My Custom Key' } })
    fireEvent.click(screen.getByRole('button', { name: /Create key/i }))

    // The raw key is shown exactly once after creation
    await waitFor(() =>
      expect(screen.getByText('sk_newrawkey')).toBeInTheDocument(),
    )

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
      name: 'My Custom Key',
    })
  })
})
