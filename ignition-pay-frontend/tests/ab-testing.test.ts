import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeExperiment,
  controlVariantId,
  getExperimentVariant,
  hashToRange,
  peekExperimentVariant,
  resetExperiment,
  resolveVariant,
  subscribeToExperimentEvents,
  type Experiment,
} from '../lib/ab-testing'

const BASE: Experiment = {
  id: 'send-form-layout',
  variants: [{ id: 'control' }, { id: 'compact' }],
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('experiment definitions (#670)', () => {
  it('treats the first variant as the control', () => {
    expect(controlVariantId(BASE)).toBe('control')
  })

  it('honours an explicit control variant', () => {
    expect(controlVariantId({ ...BASE, controlVariantId: 'compact' })).toBe('compact')
  })

  it('falls back to the first variant when the control id is unknown', () => {
    expect(controlVariantId({ ...BASE, controlVariantId: 'ghost' })).toBe('control')
  })
})

describe('deterministic assignment (#670)', () => {
  it('gives the same user the same variant every time', () => {
    for (let index = 0; index < 50; index += 1) {
      const userId = `user-${index}`
      expect(resolveVariant(BASE, userId)).toBe(resolveVariant(BASE, userId))
    }
  })

  it('spreads users across the variants', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 200; index += 1) {
      seen.add(resolveVariant(BASE, `user-${index}`))
    }
    expect(seen).toEqual(new Set(['control', 'compact']))
  })

  it('rejects a user entirely when trafficPercentage is 0', () => {
    const experiment = { ...BASE, trafficPercentage: 0 }
    for (let index = 0; index < 100; index += 1) {
      expect(resolveVariant(experiment, `user-${index}`)).toBe('control')
    }
  })

  it('enrols some users when trafficPercentage is above 0', () => {
    const experiment = { ...BASE, trafficPercentage: 100 }
    let nonControl = 0
    for (let index = 0; index < 200; index += 1) {
      if (resolveVariant(experiment, `user-${index}`) !== 'control') nonControl += 1
    }
    expect(nonControl).toBeGreaterThan(0)
  })

  it('respects relative variant weights', () => {
    const experiment: Experiment = {
      id: 'weighted',
      variants: [
        { id: 'heavy', weight: 9 },
        { id: 'light', weight: 1 },
      ],
    }

    let heavy = 0
    let light = 0
    for (let index = 0; index < 1000; index += 1) {
      if (resolveVariant(experiment, `user-${index}`) === 'heavy') heavy += 1
      else light += 1
    }

    expect(heavy).toBeGreaterThan(light * 3)
  })

  it('maps strings into range without going negative', () => {
    for (const input of ['', 'a', 'experiment:user', 'x'.repeat(500)]) {
      const value = hashToRange(input, 100)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(100)
    }
    expect(hashToRange('anything', 0)).toBe(0)
  })
})

describe('persistence (#670)', () => {
  it('stores the assigned variant and reuses it', () => {
    const first = getExperimentVariant(BASE, { userId: 'stable-user' })
    expect(peekExperimentVariant(BASE.id)).toBe(first)

    // A later call returns the persisted value, whatever it is.
    expect(getExperimentVariant(BASE, { userId: 'stable-user' })).toBe(first)
  })

  it('re-assigns a user whose stored variant no longer exists', () => {
    window.localStorage.setItem('ignition-pay:ab:variant:send-form-layout', 'retired')

    const variant = getExperimentVariant(BASE, { userId: 'stable-user' })

    expect(BASE.variants.map((item) => item.id)).toContain(variant)
  })

  it('clears an assignment with resetExperiment', () => {
    getExperimentVariant(BASE, { userId: 'stable-user' })
    expect(peekExperimentVariant(BASE.id)).not.toBeNull()

    resetExperiment(BASE.id)

    expect(peekExperimentVariant(BASE.id)).toBeNull()
  })
})

describe('events (#670)', () => {
  it('fires entered on assignment and completed on completion', () => {
    const events: string[] = []
    const unsubscribe = subscribeToExperimentEvents((event) => {
      events.push(`${event.type}:${event.experimentId}:${event.variantId}`)
    })

    const variant = getExperimentVariant(BASE, { userId: 'event-user' })
    completeExperiment(BASE, { userId: 'event-user', variantId: variant })

    unsubscribe()

    expect(events).toEqual([
      `entered:${BASE.id}:${variant}`,
      `completed:${BASE.id}:${variant}`,
    ])
  })

  it('stops delivering once unsubscribed', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToExperimentEvents(listener)

    unsubscribe()
    getExperimentVariant(BASE, { userId: 'event-user' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not let a throwing subscriber break assignment', () => {
    const unsubscribe = subscribeToExperimentEvents(() => {
      throw new Error('subscriber blew up')
    })

    expect(() => getExperimentVariant(BASE, { userId: 'event-user' })).not.toThrow()

    unsubscribe()
  })
})

describe('safe fallbacks (#670)', () => {
  it('falls back to the control variant when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is blocked')
    })

    // No explicit user id, so a stable id cannot be read or written: the safe
    // answer is the control variant rather than an unstable assignment.
    expect(getExperimentVariant(BASE)).toBe('control')
  })

  it('returns the control variant for a malformed experiment', () => {
    const malformed = { id: 'broken', variants: [] } as unknown as Experiment

    expect(getExperimentVariant(malformed)).toBe('control')
    expect(() => completeExperiment(malformed)).not.toThrow()
  })
})
