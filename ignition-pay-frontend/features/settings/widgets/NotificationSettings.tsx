'use client'

import { Bell, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  DIGEST_FREQUENCIES,
  isNotificationPreferencesValid,
  type DigestFrequency,
  type NotificationPreferences,
} from '../models'
import { useNotificationPreferences } from '../state'

const DIGEST_LABELS: Record<DigestFrequency, string> = {
  realtime: 'Real-time',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
  none: 'None',
}

interface ToggleRowProps {
  id: string
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

function ToggleRow({
  id,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <p id={`${id}-label`} className="font-semibold text-foreground">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        aria-labelledby={`${id}-label`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

export function NotificationSettings() {
  const {
    preferences,
    updateNotificationPreferences,
    loading,
    saving,
    error,
    setError,
  } = useNotificationPreferences()

  const disabled = loading || saving

  /**
   * Applies a candidate change only when it leaves the preferences valid, so
   * an invalid state can never be reached or persisted.
   */
  const apply = (next: NotificationPreferences) => {
    if (!isNotificationPreferencesValid(next)) {
      setError(
        'Turn on at least one notification channel before enabling a digest schedule.',
      )
      return
    }
    void updateNotificationPreferences(next)
  }

  const toggleEmail = (
    key: keyof NotificationPreferences['email'],
    checked: boolean,
  ) => {
    apply({ ...preferences, email: { ...preferences.email, [key]: checked } })
  }

  return (
    <section
      aria-labelledby="notification-settings-heading"
      className="bg-card rounded-xl border border-border p-8 space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Bell size={20} className="text-blue-500" aria-hidden="true" />
        </div>
        <div>
          <h2
            id="notification-settings-heading"
            className="text-xl font-bold text-foreground"
          >
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose how and when we keep you posted.
          </p>
        </div>
        {saving && (
          <span
            role="status"
            aria-live="polite"
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            Saving…
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500"
        >
          {error}
        </div>
      )}

      <fieldset disabled={disabled} className="min-w-0 space-y-4 border-0 p-0">
        <legend className="sr-only">Email notifications</legend>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Email notifications
        </p>

        <ToggleRow
          id="notify-trades"
          title="Trades"
          description="Fills and trade confirmations."
          checked={preferences.email.trades}
          disabled={disabled}
          onCheckedChange={(checked) => toggleEmail('trades', checked)}
        />
        <ToggleRow
          id="notify-deposits"
          title="Deposits"
          description="Incoming transfers and deposits."
          checked={preferences.email.deposits}
          disabled={disabled}
          onCheckedChange={(checked) => toggleEmail('deposits', checked)}
        />
        <ToggleRow
          id="notify-security"
          title="Security alerts"
          description="Sign-ins and suspicious activity."
          checked={preferences.email.securityAlerts}
          disabled={disabled}
          onCheckedChange={(checked) => toggleEmail('securityAlerts', checked)}
        />
      </fieldset>

      <div className="border-t border-border pt-4 space-y-4">
        <ToggleRow
          id="notify-push"
          title="Push notifications"
          description="Send alerts to your device."
          checked={preferences.push}
          disabled={disabled}
          onCheckedChange={(checked) =>
            apply({ ...preferences, push: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <label
            htmlFor="notification-digest"
            className="font-semibold text-foreground"
          >
            Digest frequency
          </label>
          <p className="text-sm text-muted-foreground">
            How often non-urgent notifications are delivered.
          </p>
        </div>
        <select
          id="notification-digest"
          value={preferences.digest}
          disabled={disabled}
          onChange={(event) =>
            apply({
              ...preferences,
              digest: event.target.value as DigestFrequency,
            })
          }
          className="px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
        >
          {DIGEST_FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {DIGEST_LABELS[frequency]}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
