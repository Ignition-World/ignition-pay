import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useOptimisticTransactions } from '../index'
import type { OptimisticTransaction } from '../../models'

describe('useOptimisticTransactions', () => {
  describe('addOptimisticEntry', () => {
    it('adds entry to pending list immediately', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)
      expect(result.current.optimisticEntries[0]).toMatchObject({
        type: 'sent',
        asset: 'XLM',
        amount: 100,
        recipient: 'GXYZ123...',
      })
    })

    it('sets status to pending for new entry', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries[0].status).toBe('pending')
    })

    it('sets isOptimistic flag to true', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries[0].isOptimistic).toBe(true)
    })

    it('sets submittedAt to current time', () => {
      const { result } = renderHook(() => useOptimisticTransactions())
      const beforeTime = Date.now()

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      const afterTime = Date.now()
      const submittedAt = result.current.optimisticEntries[0].submittedAt
      expect(submittedAt).toBeGreaterThanOrEqual(beforeTime)
      expect(submittedAt).toBeLessThanOrEqual(afterTime)
    })

    it('returns optimisticId for tracking', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      let returnedId: string

      act(() => {
        returnedId = result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(returnedId).toBe(result.current.optimisticEntries[0].optimisticId)
      expect(returnedId).toMatch(/^optimistic-/)
    })

    it('prepends to list (most recent first)', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'G1...',
          timestamp: new Date(),
        })
        result.current.addOptimisticEntry({
          type: 'received',
          asset: 'USDC',
          amount: 200,
          recipient: 'G2...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(2)
      expect(result.current.optimisticEntries[0].amount).toBe(200)
      expect(result.current.optimisticEntries[1].amount).toBe(100)
    })
  })

  describe('reconcileEntry', () => {
    it('removes optimistic entry by ID', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      let id: string

      act(() => {
        id = result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)

      act(() => {
        result.current.reconcileEntry(id!)
      })

      expect(result.current.optimisticEntries).toHaveLength(0)
    })

    it('only removes matching entry', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      let id1: string
      let id2: string

      act(() => {
        id1 = result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'G1...',
          timestamp: new Date(),
        })
        id2 = result.current.addOptimisticEntry({
          type: 'received',
          asset: 'USDC',
          amount: 200,
          recipient: 'G2...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(2)

      act(() => {
        result.current.reconcileEntry(id1!)
      })

      expect(result.current.optimisticEntries).toHaveLength(1)
      expect(result.current.optimisticEntries[0].optimisticId).toBe(id2)
    })

    it('is a no-op for unknown ID', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)

      act(() => {
        expect(() => {
          result.current.reconcileEntry('unknown-id')
        }).not.toThrow()
      })

      expect(result.current.optimisticEntries).toHaveLength(1)
    })
  })

  describe('removeOptimisticEntry', () => {
    it('removes entry on failure', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      let id: string

      act(() => {
        id = result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)

      act(() => {
        result.current.removeOptimisticEntry(id!)
      })

      expect(result.current.optimisticEntries).toHaveLength(0)
    })

    it('is a no-op for unknown ID', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)

      act(() => {
        expect(() => {
          result.current.removeOptimisticEntry('unknown-id')
        }).not.toThrow()
      })

      expect(result.current.optimisticEntries).toHaveLength(1)
    })

    it('removes multiple entries if called for different IDs', () => {
      const { result } = renderHook(() => useOptimisticTransactions())

      let id1: string
      let id2: string

      act(() => {
        id1 = result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'G1...',
          timestamp: new Date(),
        })
        id2 = result.current.addOptimisticEntry({
          type: 'received',
          asset: 'USDC',
          amount: 200,
          recipient: 'G2...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(2)

      act(() => {
        result.current.removeOptimisticEntry(id1!)
        result.current.removeOptimisticEntry(id2!)
      })

      expect(result.current.optimisticEntries).toHaveLength(0)
    })
  })

  describe('stale entry cleanup', () => {
    it('removes entries older than 5 minutes', async () => {
      vi.useFakeTimers()

      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)

      // Advance time by 6 minutes
      act(() => {
        vi.advanceTimersByTime(6 * 60 * 1000)
      })

      // Wait for cleanup interval to run
      await waitFor(() => {
        expect(result.current.optimisticEntries).toHaveLength(0)
      })

      vi.useRealTimers()
    })

    it('keeps entries younger than 5 minutes', async () => {
      vi.useFakeTimers()

      const { result } = renderHook(() => useOptimisticTransactions())

      act(() => {
        result.current.addOptimisticEntry({
          type: 'sent',
          asset: 'XLM',
          amount: 100,
          recipient: 'GXYZ123...',
          timestamp: new Date(),
        })
      })

      expect(result.current.optimisticEntries).toHaveLength(1)

      // Advance time by 4 minutes
      act(() => {
        vi.advanceTimersByTime(4 * 60 * 1000)
      })

      // Wait a bit to ensure no cleanup occurred
      await waitFor(
        () => {
          expect(result.current.optimisticEntries).toHaveLength(1)
        },
        { timeout: 500 },
      )

      vi.useRealTimers()
    })

    it('runs cleanup every 60 seconds', async () => {
      vi.useFakeTimers()

      const cleanupSpy = vi.spyOn(global, 'setInterval')

      renderHook(() => useOptimisticTransactions())

      // Check that setInterval was called with 60-second interval
      const lastCall = cleanupSpy.mock.calls[cleanupSpy.mock.calls.length - 1]
      expect(lastCall[1]).toBe(60 * 1000)

      cleanupSpy.mockRestore()
      vi.useRealTimers()
    })
  })
})
