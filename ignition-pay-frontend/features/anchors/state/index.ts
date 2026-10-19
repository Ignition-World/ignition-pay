'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  Sep24WizardState,
  Sep24Operation,
  AnchorHistoryQuery,
  AnchorHistoryResponse,
  AnchorHistoryItem,
  QuoteResponse,
} from '@/features/anchors/models'
import { initiateSep24, pollSep24Status, isSep24Terminal, fetchAnchorHistory, fetchQuote } from '@/features/anchors/services'
import { trackEvent } from '@/lib/analytics'

const POLL_INTERVAL_MS = 3000

/** Where the in-progress selection is kept so a reload, tab reopen or back/forward doesn't lose it. */
export const SEP24_DRAFT_KEY = 'ignition:sep24-wizard-draft'
/** A draft older than this is ignored on restore. */
const DRAFT_MAX_AGE_MS = 30 * 60 * 1000
/** Marker stored in `history.state` for each wizard step the browser can navigate back to. */
const HISTORY_MARKER = 'sep24Step'

type ResumableStep = 'operation' | 'form'

export interface Sep24Draft {
  anchorName: string
  operation: Sep24Operation | null
  assetCode: string
  assetIssuer?: string
  amount: string
  step: ResumableStep
  savedAt: number
}

export function readSep24Draft(now: number = Date.now()): Sep24Draft | null {
  try {
    const raw = window.localStorage.getItem(SEP24_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Sep24Draft
    if (!draft || typeof draft.savedAt !== 'number' || now - draft.savedAt > DRAFT_MAX_AGE_MS) {
      return null
    }
    if (draft.step !== 'operation' && draft.step !== 'form') return null
    return draft
  } catch {
    return null
  }
}

function writeSep24Draft(state: Sep24WizardState, step: ResumableStep): void {
  const draft: Sep24Draft = {
    anchorName: state.anchorName,
    operation: state.operation,
    assetCode: state.assetCode,
    assetIssuer: state.assetIssuer,
    amount: state.amount,
    step,
    savedAt: Date.now(),
  }
  try {
    window.localStorage.setItem(SEP24_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Persisting the draft is best-effort.
  }
}

function clearSep24Draft(): void {
  try {
    window.localStorage.removeItem(SEP24_DRAFT_KEY)
  } catch {
    // ignore
  }
}

function pushWizardHistory(step: ResumableStep): void {
  if (typeof window === 'undefined') return
  window.history.pushState({ ...window.history.state, [HISTORY_MARKER]: step }, '')
}

function restoreFromDraft(draft: Sep24Draft): Sep24WizardState {
  return {
    ...INITIAL_STATE,
    open: true,
    anchorName: draft.anchorName,
    operation: draft.operation,
    assetCode: draft.assetCode,
    assetIssuer: draft.assetIssuer,
    amount: draft.amount,
    step: draft.step === 'form' && draft.operation ? 'form' : 'operation',
  }
}

const INITIAL_STATE: Sep24WizardState = {
  open: false,
  anchorName: '',
  operation: null,
  assetCode: 'USD',
  amount: '',
  step: 'operation',
  transactionId: null,
  anchorTxId: null,
  interactiveUrl: null,
  status: null,
  quote: null,
  error: null,
  isSubmitting: false,
}

export function useSep24Wizard() {
  const [state, setState] = useState<Sep24WizardState>(INITIAL_STATE)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref for interactive timeout handling
  const interactiveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const clearPolling = useCallback(() => {
    // Clear polling interval and abort controller
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    // Clear any interactive timeout
    if (interactiveTimeoutRef.current) {
      clearTimeout(interactiveTimeoutRef.current)
      interactiveTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => clearPolling()
  }, [clearPolling])

  // Resume an unfinished selection after a reload or reopened tab. Done after
  // mount so server and client markup agree.
  useEffect(() => {
    const draft = readSep24Draft()
    if (draft) setState(restoreFromDraft(draft))
  }, [])

  // Keep the selection saved while the user is still choosing (before anything
  // has been sent to the anchor).
  useEffect(() => {
    if (state.open && (state.step === 'operation' || state.step === 'form')) {
      writeSep24Draft(state, state.step)
    }
  }, [state])

  // Browser back/forward moves between wizard steps instead of discarding them.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const marker = (event.state as Record<string, unknown> | null)?.[HISTORY_MARKER] as
        | ResumableStep
        | undefined

      setState((prev) => {
        if (!prev.open) {
          // Forward into a wizard entry: bring the saved selection back.
          const draft = marker ? readSep24Draft() : null
          if (!draft) return prev
          const restored = restoreFromDraft(draft)
          return marker === 'operation' ? { ...restored, step: 'operation' } : restored
        }
        // Only the selection steps are navigable; never interrupt a quote or transfer.
        if (prev.step !== 'operation' && prev.step !== 'form') return prev
        // Back past the first wizard entry: hide the wizard but keep the draft.
        if (!marker) return { ...prev, open: false }
        if (marker === 'operation' && prev.step === 'form') return { ...prev, step: 'operation' }
        if (marker === 'form' && prev.step === 'operation' && prev.operation) {
          return { ...prev, step: 'form' }
        }
        return prev
      })
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const open = useCallback(
    (anchorName: string, initialOperation?: Sep24Operation) => {
      pushWizardHistory(initialOperation ? 'form' : 'operation')
      setState({
        ...INITIAL_STATE,
        open: true,
        anchorName,
        operation: initialOperation ?? null,
        step: initialOperation ? 'form' : 'operation',
      })
    },
    [],
  )

  const close = useCallback(() => {
    clearPolling()
    clearSep24Draft()
    setState(INITIAL_STATE)
  }, [clearPolling])

  const setOperation = useCallback((operation: Sep24Operation) => {
    pushWizardHistory('form')
    setState((prev) => ({ ...prev, operation, step: 'form' }))
  }, [])

  const setAssetCode = useCallback((assetCode: string) => {
    setState((prev) => ({ ...prev, assetCode }))
  }, [])

  const setAmount = useCallback((amount: string) => {
    setState((prev) => ({ ...prev, amount }))
  }, [])

  const setAssetIssuer = useCallback((issuer?: string) => {
    setState((prev) => ({ ...prev, assetIssuer: issuer }))
  }, [])

  const fetchQuoteForAmount = useCallback(
    async () => {
      if (!state.operation || !state.amount || parseFloat(state.amount) <= 0) return

      setState((prev) => ({ ...prev, isSubmitting: true, error: null }))

      try {
        const buyAsset = state.assetCode === 'USDC' ? 'USDC' : 'USDC'
        const quote = await fetchQuote({
          anchorName: state.anchorName,
          sellAsset: state.assetCode,
          buyAsset,
          sellAmount: parseFloat(state.amount),
        })

        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          step: 'quote',
          quote,
        }))
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          error: err?.message ?? 'Failed to get quote',
        }))
      }
    },
    [state.operation, state.anchorName, state.assetCode, state.amount],
  )

  const confirmQuote = useCallback(
    async (stellarAccount: string) => {
      if (!state.operation || !state.quote) return

      setState((prev) => ({ ...prev, isSubmitting: true, error: null }))

      const analyticsEvent =
        state.operation === 'deposit'
          ? 'anchor_deposit_started'
          : 'anchor_withdrawal_started'

      trackEvent(analyticsEvent, {
        anchor: state.anchorName,
        asset: state.assetCode,
        quoteId: state.quote.id,
      })

      try {
        const result = await initiateSep24({
          anchorName: state.anchorName,
          operation: state.operation,
          assetCode: state.assetCode,
          assetIssuer: state.assetIssuer,
          amount: state.amount ? parseFloat(state.amount) : undefined,
          stellarAccount,
        })

        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          step: 'interactive',
          transactionId: result.id,
          anchorTxId: result.anchorTxId,
          interactiveUrl: result.interactiveUrl,
          status: {
            id: result.id,
            anchorTxId: result.anchorTxId,
            status: 'incomplete',
            startedAt: result.startedAt,
          },
        }))

        // Start interactive timeout timer
        if (interactiveTimeoutRef.current) {
          clearTimeout(interactiveTimeoutRef.current)
        }
        interactiveTimeoutRef.current = setTimeout(() => {
          setState((prev) => ({
            ...prev,
            step: 'error',
            error: 'Interactive flow timed out. Please try again or open in a new tab.',
          }))
          clearPolling()
        }, INTERACTIVE_TIMEOUT_MS)

        startPolling(result.id)
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          step: 'error',
          error: err?.message ?? 'Failed to initiate transaction',
        }))
      }
    },
    [state.operation, state.anchorName, state.assetCode, state.assetIssuer, state.amount, state.quote],
  )

  const startPolling = useCallback(
    (txId: string) => {
      clearPolling()

      const controller = new AbortController()
      abortRef.current = controller

      const poll = async () => {
        try {
          const status = await pollSep24Status(txId, controller.signal)
          setState((prev) => ({
            ...prev,
            status,
            step: isSep24Terminal(status.status) ? 'completed' : 'interactive',
          }))

          if (isSep24Terminal(status.status)) {
     // Clear interactive timeout when terminal state reached
     if (interactiveTimeoutRef.current) {
       clearTimeout(interactiveTimeoutRef.current)
       interactiveTimeoutRef.current = null
     }
            clearPolling()
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
        }
      }

      poll()
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    },
    [clearPolling],
  )

  const reset = useCallback(() => {
    clearPolling()
    setState((prev) => ({
      ...prev,
      step: 'form',
      transactionId: null,
      anchorTxId: null,
      interactiveUrl: null,
      status: null,
      quote: null,
      error: null,
    }))
  }, [clearPolling])

  return {
    state,
    open,
    close,
    setOperation,
    setAssetCode,
    setAssetIssuer,
    setAmount,
    fetchQuoteForAmount,
    confirmQuote,
    reset,
  }
}

// ---------------------------------------------------------------------------
// Anchor History Hook
// ---------------------------------------------------------------------------

export interface UseAnchorHistoryResult {
  items: AnchorHistoryItem[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  error: string | null
  query: AnchorHistoryQuery
  setQuery: (q: AnchorHistoryQuery) => void
  refresh: () => void
}

export function useAnchorHistory(initialQuery: AnchorHistoryQuery = {}): UseAnchorHistoryResult {
  const [items, setItems] = useState<AnchorHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQueryState] = useState<AnchorHistoryQuery>({
    page: 1,
    limit: 20,
    ...initialQuery,
  })
  const abortRef = useRef<AbortController | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const load = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const result: AnchorHistoryResponse = await fetchAnchorHistory(query, controller.signal)
      if (!controller.signal.aborted) {
        setItems(result.items)
        setTotal(result.total)
        setPage(result.page)
        setLimit(result.limit)
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message ?? 'Failed to load anchor history')
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [query, refreshToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    return () => {
      abortRef.current?.abort()
    }
  }, [load])

  const setQuery = useCallback((q: AnchorHistoryQuery) => {
    setQueryState((prev) => ({ ...prev, ...q }))
  }, [])

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  return { items, total, page, limit, isLoading, error, query, setQuery, refresh }
}
