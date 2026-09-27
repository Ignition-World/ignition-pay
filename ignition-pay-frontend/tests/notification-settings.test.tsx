import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationSettings } from '../features/settings/widgets/NotificationSettings'

const API_BASE = 'http://localhost:3000'

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response
}

/** Builds a fetch stub that answers GET and PATCH independently. */
function stubFetch(getBody: unknown, patchOk = true) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve(
        jsonResponse(patchOk ? { ok: true } : { message: 'Boom' }, patchOk),
      )
    }
    return Promise.resolve(jsonResponse(getBody))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads and restores saved preferences on mount', async () => {
    stubFetch({
      preferences: JSON.stringify({
        currency: 'USD',
        notifications: {
          email: { trades: false, deposits: true, securityAlerts: false },
          push: true,
          digest: 'weekly',
        },
      }),
    })

    render(<NotificationSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Trades' })).toBeEnabled(),
    )

    expect(screen.getByRole('switch', { name: 'Trades' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Deposits' })).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Security alerts' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Push notifications' }),
    ).toBeChecked()
    expect(screen.getByLabelText('Digest frequency')).toHaveValue('weekly')

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/v1/users/me`,
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('saves changes optimistically and persists the merged preferences', async () => {
    const fetchMock = stubFetch({ preferences: null })

    render(<NotificationSettings />)

    const trades = await screen.findByRole('switch', { name: 'Trades' })
    await waitFor(() => expect(trades).toBeEnabled())

    fireEvent.click(trades)

    // Optimistic UI updates before the request settles.
    expect(trades).not.toBeChecked()

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
      const body = JSON.parse((patchCall![1] as RequestInit).body as string)
      const saved = JSON.parse(body.preferences)
      expect(saved.notifications.email.trades).toBe(false)
      expect(saved.notifications.email.deposits).toBe(true)
    })
  })

  it('blocks a digest schedule when every channel is off and does not save', async () => {
    const fetchMock = stubFetch({
      preferences: JSON.stringify({
        notifications: {
          email: { trades: false, deposits: false, securityAlerts: false },
          push: false,
          digest: 'none',
        },
      }),
    })

    render(<NotificationSettings />)

    const digest = await screen.findByLabelText('Digest frequency')
    await waitFor(() => expect(digest).toBeEnabled())

    fireEvent.change(digest, { target: { value: 'daily' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /at least one notification channel/i,
    )
    expect(digest).toHaveValue('none')
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
    ).toBe(false)
  })

  it('rolls back and surfaces an error when saving fails', async () => {
    stubFetch({ preferences: null }, false)

    render(<NotificationSettings />)

    const trades = await screen.findByRole('switch', { name: 'Trades' })
    await waitFor(() => expect(trades).toBeEnabled())

    fireEvent.click(trades)
    expect(trades).not.toBeChecked()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(trades).toBeChecked()
  })
})
