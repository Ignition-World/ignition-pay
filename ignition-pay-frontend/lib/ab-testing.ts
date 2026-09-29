/**
 * Lightweight A/B testing and feature-flag framework (issue #670).
 *
 * Pure TypeScript with no third-party dependencies, so it can run on the
 * server (where `localStorage` is absent) and in the browser.
 *
 * The pieces:
 *
 * - {@link Experiment} describes a feature with two or more named variants and
 *   the percentage of users who should see it at all.
 * - {@link getExperimentVariant} returns the variant for the current user. It
 *   is deterministic — the same user always lands in the same variant — because
 *   the choice comes from hashing `user + experiment`, not from `Math.random()`.
 *   The winner is persisted in `localStorage` so a later change to the
 *   experiment's weights cannot move an existing user.
 * - {@link subscribeToExperimentEvents} exposes `entered` / `completed` events
 *   so analytics and tests can observe assignment without this module knowing
 *   about any analytics provider.
 *
 * Everything is wrapped so that a failure — disabled storage, a malformed
 * experiment, a throwing listener — resolves to the control variant instead of
 * breaking the page.
 */

export interface ExperimentVariant {
  /** Stable variant id, e.g. `control` or `compact-form`. */
  id: string
  /**
   * Relative share when picking a variant. Defaults to `1`. A variant with
   * weight `2` is twice as likely as one with weight `1`.
   */
  weight?: number
}

export interface Experiment {
  /** Stable id. Used as the storage key suffix and as the hash salt. */
  id: string
  /** At least one variant. The first variant is the control. */
  variants: ExperimentVariant[]
  /**
   * Share of users enrolled in the experiment, 0–100. Defaults to `100`.
   * Users outside this bucket always receive the control variant.
   */
  trafficPercentage?: number
  /**
   * Variant for users outside the experiment or when resolution fails.
   * Defaults to the first variant (the control).
   */
  controlVariantId?: string
}

export type ExperimentEventType = 'entered' | 'completed'

export interface ExperimentEvent {
  type: ExperimentEventType
  experimentId: string
  variantId: string
  /** `null` only when no browser storage was available to hold an anonymous id. */
  userId: string | null
}

export type ExperimentEventListener = (event: ExperimentEvent) => void

const VARIANT_STORAGE_PREFIX = 'ignition-pay:ab:variant:'
const USER_ID_STORAGE_KEY = 'ignition-pay:ab:user-id'

const listeners = new Set<ExperimentEventListener>()

/**
 * FNV-1a, 32-bit. Small, dependency-free and stable across engines — the value
 * only has to be well-distributed, not cryptographic.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    // hash *= 16777619, kept in 32-bit range with Math.imul.
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Maps a string into `[0, modulo)`. `modulo <= 0` collapses to `0`. */
export function hashToRange(input: string, modulo: number): number {
  if (!Number.isFinite(modulo) || modulo <= 0) return 0
  return fnv1a(input) % Math.floor(modulo)
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    // Private browsing modes can throw on access.
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(key, value)
  } catch {
    // Persistence is best-effort; the in-memory result is still returned.
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(key)
  } catch {
    // Ignore: nothing to clean up if storage is unavailable.
  }
}

function isValidExperiment(experiment: Experiment | undefined | null): experiment is Experiment {
  return Boolean(
    experiment &&
      typeof experiment.id === 'string' &&
      experiment.id.length > 0 &&
      Array.isArray(experiment.variants) &&
      experiment.variants.length > 0 &&
      experiment.variants.every(
        (variant) => variant && typeof variant.id === 'string' && variant.id.length > 0,
      ),
  )
}

/** The variant shown outside the experiment, or when something goes wrong. */
export function controlVariantId(experiment: Experiment): string {
  const requested = experiment?.controlVariantId
  if (requested && experiment.variants.some((variant) => variant.id === requested)) {
    return requested
  }
  return experiment?.variants?.[0]?.id ?? 'control'
}

/**
 * Anonymous, stable user id. Stored in `localStorage` so the same browser keeps
 * the same id across reloads. Generated lazily so importing this module never
 * touches storage on the server.
 */
export function getOrCreateExperimentUserId(): string | null {
  let existing: string | null
  try {
    existing =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(USER_ID_STORAGE_KEY)
        : null
  } catch {
    // Storage is unavailable, so a stable id cannot be persisted. Returning
    // null makes the caller fall back to the control variant instead of
    // risking a different variant on every load.
    return null
  }
  if (existing) return existing

  let id: string
  try {
    id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  } catch {
    return null
  }

  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    window.localStorage.setItem(USER_ID_STORAGE_KEY, id)
  } catch {
    return null
  }

  return id
}

/**
 * Pure, deterministic variant choice for a given user. Exposed for tests and for
 * callers that already have a stable user id (e.g. an authenticated account).
 */
export function resolveVariant(experiment: Experiment, userId: string): string {
  const control = controlVariantId(experiment)
  if (!isValidExperiment(experiment)) return control

  const traffic = Math.min(100, Math.max(0, experiment.trafficPercentage ?? 100))
  // The traffic bucket must be independent of the variant bucket, otherwise a
  // small traffic percentage would bias which variant enrolled users receive.
  if (hashToRange(`${experiment.id}:${userId}`, 100) >= traffic) return control

  const totalWeight = experiment.variants.reduce(
    (total, variant) => total + Math.max(0, variant.weight ?? 1),
    0,
  )
  if (totalWeight <= 0) return control

  let ticket = hashToRange(`${experiment.id}:variant:${userId}`, totalWeight)
  for (const variant of experiment.variants) {
    const weight = Math.max(0, variant.weight ?? 1)
    if (ticket < weight) return variant.id
    ticket -= weight
  }

  return control
}

function emit(event: ExperimentEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch {
      // A misbehaving subscriber must not break assignment.
    }
  }
}

/**
 * Returns the current user's variant, reading it from storage when one has
 * already been assigned. Emits an `entered` event each time it resolves (which
 * is idempotent) so a late subscriber still observes the assignment. Falls back
 * to the control variant on any error.
 */
export function getExperimentVariant(
  experiment: Experiment,
  options: { userId?: string } = {},
): string {
  let control: string
  try {
    control = controlVariantId(experiment)
  } catch {
    return 'control'
  }

  try {
    if (!isValidExperiment(experiment)) return control

    const userId = options.userId ?? getOrCreateExperimentUserId()
    // Without a stable id there is no way to keep the same user on the same
    // variant across loads, so stay on the control. This is also the fallback
    // when storage is unavailable.
    if (userId === null) return control

    const storageKey = VARIANT_STORAGE_PREFIX + experiment.id
    const stored = safeGetItem(storageKey)

    // An experiment whose variant list changed must not strand a user on a
    // variant that no longer exists.
    if (stored && experiment.variants.some((variant) => variant.id === stored)) {
      emit({ type: 'entered', experimentId: experiment.id, variantId: stored, userId })
      return stored
    }

    const variantId = resolveVariant(experiment, userId)
    safeSetItem(storageKey, variantId)
    emit({ type: 'entered', experimentId: experiment.id, variantId, userId })
    return variantId
  } catch {
    return control
  }
}

/** Fires a `completed` event for the experiment. No-op if it cannot resolve. */
export function completeExperiment(
  experiment: Experiment,
  options: { userId?: string; variantId?: string } = {},
): void {
  try {
    if (!isValidExperiment(experiment)) return
    const variantId =
      options.variantId ?? safeGetItem(VARIANT_STORAGE_PREFIX + experiment.id) ?? controlVariantId(experiment)
    emit({
      type: 'completed',
      experimentId: experiment.id,
      variantId,
      userId: options.userId ?? getOrCreateExperimentUserId(),
    })
  } catch {
    // Completion is telemetry: never let it throw into the caller.
  }
}

/** Clears a persisted assignment, so the next call re-enrols the user. */
export function resetExperiment(experimentId: string): void {
  safeRemoveItem(VARIANT_STORAGE_PREFIX + experimentId)
}

/** Subscribes to enter/complete events. Returns an unsubscribe function. */
export function subscribeToExperimentEvents(listener: ExperimentEventListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Reads the persisted variant without assigning or emitting, if any. */
export function peekExperimentVariant(experimentId: string): string | null {
  return safeGetItem(VARIANT_STORAGE_PREFIX + experimentId)
}
