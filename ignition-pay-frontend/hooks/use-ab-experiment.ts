'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  completeExperiment,
  controlVariantId,
  getExperimentVariant,
  subscribeToExperimentEvents,
  type Experiment,
  type ExperimentEvent,
} from '@/lib/ab-testing'

export interface UseExperimentResult {
  /** The variant to render. Always the control on the server and first render. */
  variantId: string
  /** True when the resolved variant is the experiment's control. */
  isControl: boolean
  /** Fires the `completed` event; call it when the user finishes the flow. */
  complete: () => void
}

/**
 * Resolves an experiment variant for the current user (issue #670).
 *
 * The server and the first client render must agree, so the initial value is
 * always the control variant and the real assignment is applied from an effect
 * after mount. Assignment is deterministic and persisted, so the swap does not
 * flicker between variants on later renders.
 */
export function useExperiment(
  experiment: Experiment,
  options: { userId?: string } = {},
): UseExperimentResult {
  const { userId } = options
  const control = controlVariantId(experiment)
  const [variantId, setVariantId] = useState(control)

  // Depend on the primitive identity, not the object, so an experiment defined
  // inline does not re-assign on every render.
  useEffect(() => {
    setVariantId(getExperimentVariant(experiment, { userId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiment.id, userId])

  const complete = useCallback(() => {
    completeExperiment(experiment, { userId, variantId })
  }, [experiment, userId, variantId])

  return useMemo(
    () => ({ variantId, isControl: variantId === control, complete }),
    [variantId, control, complete],
  )
}

/** Subscribes to experiment enter/complete events for the component's lifetime. */
export function useExperimentEvents(listener: (event: ExperimentEvent) => void): void {
  useEffect(() => subscribeToExperimentEvents(listener), [listener])
}
