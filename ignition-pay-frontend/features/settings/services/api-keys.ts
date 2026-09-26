import { API_ENDPOINTS, API_PREFIX } from '@/lib/constants'
import type {
  ApiKeySummary,
  CreateApiKeyResult,
  RotateApiKeyResult,
} from '../models'
import { getApiBase } from './index'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${API_PREFIX}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message ?? `Request failed (${res.status})`)
  }

  return res.json() as Promise<T>
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const data = await apiFetch<{ apiKeys: ApiKeySummary[] }>(
    API_ENDPOINTS.apiKeys.root,
  )
  return data.apiKeys
}

export async function createApiKey(name?: string): Promise<CreateApiKeyResult> {
  return apiFetch<CreateApiKeyResult>(API_ENDPOINTS.apiKeys.root, {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  })
}

export async function rotateApiKey(id: string): Promise<RotateApiKeyResult> {
  return apiFetch<RotateApiKeyResult>(API_ENDPOINTS.apiKeys.rotate(id), {
    method: 'POST',
  })
}

export async function finalizeApiKeyRotation(id: string): Promise<{
  message: string
  newKeyId: string
}> {
  return apiFetch(API_ENDPOINTS.apiKeys.rotateFinalize(id), {
    method: 'POST',
  })
}

export async function cancelApiKeyRotation(id: string): Promise<{
  message: string
}> {
  return apiFetch(API_ENDPOINTS.apiKeys.rotateCancel(id), {
    method: 'POST',
  })
}

export async function revokeApiKey(id: string): Promise<{ message: string }> {
  return apiFetch(API_ENDPOINTS.apiKeys.byId(id), {
    method: 'DELETE',
  })
}
