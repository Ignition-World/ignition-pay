import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExperiment, useExperimentEvents } from '../hooks/use-ab-experiment'
import {
  peekExperimentVariant,
  resolveVariant,
  subscribeToExperimentEvents,
  type Experiment,
} from '../lib/ab-testing'

const EXPERIMENT: Experiment = {
  id: 'dashboard-asset-layout',
  variants: [{ id: 'control' }, { id: 'grid-compact' }],
}

/** A user id that the deterministic hash resolves to the non-control variant. */
const TREATMENT_USER =
  Array.from({ length: 200 }, (_, index) => `user-${index}`).find(
    (userId) => resolveVariant(EXPERIMENT, userId) === 'grid-compact',
  ) ?? 'user-0'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useExperiment (#670)', () => {
  it('renders the control variant on the first render, then the assignment', async () => {
    const renders: string[] = []
    const { result } = renderHook(() => {
      const value = useExperiment(EXPERIMENT, { userId: TREATMENT_USER })
      renders.push(value.variantId)
      return value
    })

    // The first render has to match the server markup, so it is always control.
    expect(renders[0]).toBe('control')

    await waitFor(() => expect(result.current.variantId).toBe('grid-compact'))
    expect(peekExperimentVariant(EXPERIMENT.id)).toBe('grid-compact')
    expect(result.current.isControl).toBe(false)
  })

  it('reuses a persisted assignment across mounts', async () => {
    const first = renderHook(() => useExperiment(EXPERIMENT, { userId: TREATMENT_USER }))
    await waitFor(() => expect(first.result.current.variantId).toBe('grid-compact'))
    first.unmount()

    const second = renderHook(() => useExperiment(EXPERIMENT, { userId: 'someone-else' }))
    await waitFor(() => expect(second.result.current.variantId).toBe('grid-compact'))
  })

  it('fires completed when complete is called', async () => {
    const events: string[] = []
    const unsubscribe = subscribeToExperimentEvents((event) => {
      events.push(event.type)
    })

    const { result } = renderHook(() =>
      useExperiment(EXPERIMENT, { userId: TREATMENT_USER }),
    )
    await waitFor(() => expect(events).toContain('entered'))

    act(() => result.current.complete())

    expect(events).toContain('completed')
    unsubscribe()
  })

  it('forwards framework events to useExperimentEvents subscribers', async () => {
    const listener = vi.fn()
    renderHook(() => useExperimentEvents(listener))
    renderHook(() => useExperiment(EXPERIMENT, { userId: TREATMENT_USER }))

    await waitFor(() => expect(listener).toHaveBeenCalled())
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: 'entered',
      experimentId: EXPERIMENT.id,
    })
  })

  it('falls back to control when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    const { result } = renderHook(() => useExperiment(EXPERIMENT))

    await waitFor(() => expect(result.current.variantId).toBe('control'))
  })
})
