import { useState, useCallback, useEffect } from 'react'
import type { OptimisticTransaction } from '../models'
import { generateOptimisticId } from '../models'

const STORAGE_KEY = 'ignition_optimistic_txs'

let globalOptimisticEntries: OptimisticTransaction[] = []
let listeners = new Set<() => void>()

function getInitialEntries(): OptimisticTransaction[] {
  if (typeof window === 'undefined') return []
  try {
    const item = window.localStorage.getItem(STORAGE_KEY)
    return item ? JSON.parse(item) : []
  } catch (error) {
    console.error('Error reading localStorage', error)
    return []
  }
}

// Initialize on first load
if (typeof window !== 'undefined') {
  globalOptimisticEntries = getInitialEntries()
}

function updateEntries(newEntries: OptimisticTransaction[]) {
  globalOptimisticEntries = newEntries
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(globalOptimisticEntries))
  }
  listeners.forEach((listener) => listener())
}

/**
 * Manages optimistic pending transaction entries.
 *
 * Flow:
 * 1. User submits → addOptimisticEntry() called immediately
 * 2. UI shows entry as "pending" right away (no wait for backend)
 * 3. Backend confirms → reconcileEntry() replaces optimistic with real
 * 4. Backend fails → removeOptimisticEntry() removes the entry
 *
 * This gives users instant feedback while maintaining consistency.
 */
export function useOptimisticTransactions() {
  const [optimisticEntries, setOptimisticEntries] = useState<OptimisticTransaction[]>(
    globalOptimisticEntries,
  )

  useEffect(() => {
    setOptimisticEntries(globalOptimisticEntries)
    const listener = () => {
      setOptimisticEntries(globalOptimisticEntries)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  /**
   * Adds an optimistic entry to the pending list immediately.
   * Call this BEFORE the async submission starts.
   *
   * @param entry Transaction data to create optimistic entry from
   * @returns The generated optimisticId for tracking reconciliation
   */
  const addOptimisticEntry = useCallback(
    (
      entry: Omit<
        OptimisticTransaction,
        'optimisticId' | 'isOptimistic' | 'status' | 'submittedAt'
      >,
    ) => {
      const optimisticId = generateOptimisticId()
      const optimisticEntry: OptimisticTransaction = {
        ...entry,
        optimisticId,
        status: 'pending',
        submittedAt: Date.now(),
        isOptimistic: true,
      }
      updateEntries([optimisticEntry, ...globalOptimisticEntries])
      return optimisticId
    },
    [],
  )

  /**
   * Removes an optimistic entry after successful backend confirmation.
   * The real entry from backend will appear in the fetched list.
   *
   * @param optimisticId The optimistic ID to remove
   */
  const reconcileEntry = useCallback((optimisticId: string) => {
    updateEntries(globalOptimisticEntries.filter((e) => e.optimisticId !== optimisticId))
  }, [])

  /**
   * Removes an optimistic entry on submission failure.
   * Show an error toast alongside this call.
   *
   * @param optimisticId The optimistic ID to remove
   */
  const removeOptimisticEntry = useCallback((optimisticId: string) => {
    updateEntries(globalOptimisticEntries.filter((e) => e.optimisticId !== optimisticId))
  }, [])

  /**
   * Cleanup stale optimistic entries.
   * Prevents orphaned optimistic entries if reconciliation never fires.
   * Removes entries older than 5 minutes.
   */
  useEffect(() => {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
    const CHECK_INTERVAL_MS = 60 * 1000 // check every minute

    const cleanup = setInterval(() => {
      const filtered = globalOptimisticEntries.filter(
        (e) => Date.now() - e.submittedAt < STALE_THRESHOLD_MS,
      )
      if (filtered.length !== globalOptimisticEntries.length) {
        updateEntries(filtered)
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(cleanup)
  }, [])

  return {
    optimisticEntries,
    addOptimisticEntry,
    reconcileEntry,
    removeOptimisticEntry,
  }
}

