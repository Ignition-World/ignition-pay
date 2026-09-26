'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { NotificationPreferences, UserPreferences } from '../models'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isNotificationPreferencesValid,
  normalizeNotificationPreferences,
} from '../models'
import { fetchUserPreferences, updatePreferences } from '../services'

const DEFAULT_PREFERENCES: UserPreferences = {
  currency: 'USD',
  locale: 'en',
  theme: 'Dark',
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [saving, setSaving] = useState(false)

  const save = useCallback(async (next: UserPreferences) => {
    setSaving(true)
    try {
      await updatePreferences(next)
      setPreferences(next)
    } finally {
      setSaving(false)
    }
  }, [])

  return { preferences, setPreferences, save, saving }
}

/**
 * Loads notification preferences from the backend and persists changes with
 * optimistic UI. Invalid states (a digest schedule with every channel off) are
 * rejected before any request is made and surfaced through `error`.
 */
export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Keeps the non-notification fields so saving never clobbers them.
  const fullPreferencesRef = useRef<UserPreferences>({})

  useEffect(() => {
    let active = true
    setLoading(true)

    fetchUserPreferences()
      .then((loaded) => {
        if (!active) return
        fullPreferencesRef.current = loaded
        setPreferences(normalizeNotificationPreferences(loaded.notifications))
      })
      .catch(() => {
        // Fall back to defaults; a load failure must not block the screen.
        if (active) fullPreferencesRef.current = {}
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const updateNotificationPreferences = useCallback(
    async (next: NotificationPreferences): Promise<boolean> => {
      if (!isNotificationPreferencesValid(next)) {
        setError(
          'Enable at least one notification channel before scheduling a digest.',
        )
        return false
      }

      const previous = preferences
      setPreferences(next) // optimistic update
      setSaving(true)
      setError(null)

      try {
        const merged: UserPreferences = {
          ...fullPreferencesRef.current,
          notifications: next,
        }
        await updatePreferences(merged)
        fullPreferencesRef.current = merged
        return true
      } catch (err) {
        setPreferences(previous) // roll back on failure
        setError(
          (err as Error).message || 'Could not save notification preferences.',
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [preferences],
  )

  return {
    preferences,
    updateNotificationPreferences,
    loading,
    saving,
    error,
    setError,
  }
}

