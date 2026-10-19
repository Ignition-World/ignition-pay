import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchTransactions } from '../index'

describe('fetchTransactions', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches transactions from API endpoint', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const result = await fetchTransactions()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/transactions'),
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    )
    expect(result).toEqual(mockResponse)
  })

  it('includes cursor in query parameters when provided', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    await fetchTransactions({ cursor: 'test-cursor-id' })

    const callUrl = (global.fetch as any).mock.calls[0][0]
    expect(callUrl).toContain('cursor=test-cursor-id')
  })

  it('includes limit in query parameters', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 20,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    await fetchTransactions({ limit: 20 })

    const callUrl = (global.fetch as any).mock.calls[0][0]
    expect(callUrl).toContain('limit=20')
  })

  it('includes status filter in query parameters', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    await fetchTransactions({ status: 'PENDING' })

    const callUrl = (global.fetch as any).mock.calls[0][0]
    expect(callUrl).toContain('status=PENDING')
  })

  it('includes asset filter in query parameters', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    await fetchTransactions({ asset: 'XLM' })

    const callUrl = (global.fetch as any).mock.calls[0][0]
    expect(callUrl).toContain('asset=XLM')
  })

  it('transforms timestamps to Date objects', async () => {
    const mockResponse = {
      data: [
        {
          id: '1',
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ...',
          status: 'confirmed',
          createdAt: '2024-01-01T12:00:00Z',
        },
      ],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const result = await fetchTransactions()

    expect(result.data[0].timestamp).toBeInstanceOf(Date)
    expect(result.data[0].timestamp.toISOString()).toBe('2024-01-01T12:00:00Z')
  })

  it('uses AbortSignal when provided', async () => {
    const mockResponse = {
      data: [],
      nextCursor: null,
      hasNextPage: false,
      limit: 10,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const controller = new AbortController()

    await fetchTransactions({}, controller.signal)

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: controller.signal,
      }),
    )
  })

  it('throws error when response is not ok', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Unauthorized',
    })

    await expect(fetchTransactions()).rejects.toThrow('Failed to fetch transactions')
  })

  it('throws error on network failure', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'))

    await expect(fetchTransactions()).rejects.toThrow('Network timeout')
  })

  it('supports multiple filters simultaneously', async () => {
    const mockResponse = {
      data: [],
      nextCursor: 'next-id',
      hasNextPage: true,
      limit: 5,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    await fetchTransactions({
      cursor: 'last-id',
      limit: 5,
      status: 'PENDING',
      asset: 'USDC',
    })

    const callUrl = (global.fetch as any).mock.calls[0][0]
    expect(callUrl).toContain('cursor=last-id')
    expect(callUrl).toContain('limit=5')
    expect(callUrl).toContain('status=PENDING')
    expect(callUrl).toContain('asset=USDC')
  })

  it('handles pagination response correctly', async () => {
    const mockResponse = {
      data: [
        {
          id: '1',
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ...',
          status: 'confirmed',
          createdAt: '2024-01-01T12:00:00Z',
        },
      ],
      nextCursor: 'next-cursor-id',
      hasNextPage: true,
      limit: 1,
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const result = await fetchTransactions()

    expect(result.nextCursor).toBe('next-cursor-id')
    expect(result.hasNextPage).toBe(true)
    expect(result.limit).toBe(1)
  })
})
