import { API_ENDPOINTS, API_PREFIX, API_BASE_URLS } from '@/lib/constants'
import type { UserPreferences } from '../models'

export const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  return API_BASE_URLS.development
}

async function patchMe(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(
    `${getApiBase()}${API_PREFIX}${API_ENDPOINTS.users.me}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message ?? 'Request failed')
  }
}

export async function updatePreferences(prefs: UserPreferences): Promise<void> {
  await patchMe({ preferences: JSON.stringify(prefs) })
}

/**
 * Loads the current user's saved preferences. The backend may return the
 * `preferences` payload either as a JSON string or an object, so both shapes
 * are normalised. Missing or unparseable values resolve to `{}` so callers can
 * fall back to defaults.
 */
export async function fetchUserPreferences(): Promise<UserPreferences> {
  const res = await fetch(
    `${getApiBase()}${API_PREFIX}${API_ENDPOINTS.users.me}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    },
  )

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message ?? 'Failed to load preferences')
  }

  const data = (await res.json().catch(() => null)) as {
    preferences?: unknown
  } | null
  const raw = data?.preferences

  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as UserPreferences
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw as UserPreferences
  return {}
}

export async function updateProfile(data: {
  displayName?: string
  avatarUrl?: string
}): Promise<void> {
  await patchMe(data)
}

