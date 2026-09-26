/**
 * Data fetching services for transaction history.
 * Uses direct fetch() API with AbortSignal (as found in Part 1 codebase).
 */

import type { Transaction } from '../models'

/**
 * Fetches transactions from the backend API.
 * Uses cursor-based pagination for efficiency.
 *
 * @param params Pagination and filter options
 * @param signal AbortSignal for cleanup
 * @returns Paginated transaction response
 */
export async function fetchTransactions(
  {
    cursor,
    limit = 10,
    status,
    asset,
    type,
    dateFrom,
    dateTo,
    search,
  }: {
    cursor?: string | null
    limit?: number
    status?: string
    asset?: string
    /** Direction filter: 'sent' | 'received'. Passed as-is to backend. */
    type?: string
    dateFrom?: string
    dateTo?: string
    search?: string
  } = {},
  signal?: AbortSignal,
): Promise<{
  data: Transaction[]
  nextCursor: string | null
  hasNextPage: boolean
  limit: number
}> {
  const searchParams = new URLSearchParams()
  if (cursor) searchParams.append('cursor', cursor)
  searchParams.append('limit', String(limit))
  if (status) searchParams.append('status', status)
  if (asset) searchParams.append('asset', asset)
  if (type) searchParams.append('type', type)
  if (dateFrom) searchParams.append('dateFrom', dateFrom)
  if (dateTo) searchParams.append('dateTo', dateTo)
  if (search) searchParams.append('search', search)

  const url = new URL('/api/v1/transactions', window.location.origin)
  url.search = searchParams.toString()

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.statusText}`)
  }

  const data = await response.json()

  // Normalise backend timestamps to Date objects
  return {
    ...data,
    data: data.data.map((tx: any) => ({
      ...tx,
      timestamp: new Date(tx.createdAt || tx.timestamp),
    })),
  }
}
