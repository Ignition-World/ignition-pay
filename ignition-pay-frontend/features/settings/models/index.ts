export type DigestFrequency = 'realtime' | 'daily' | 'weekly' | 'none'

export interface EmailNotificationPreferences {
  /** Trade and order fills. */
  trades: boolean
  /** Deposits and incoming transfers. */
  deposits: boolean
  /** Security alerts such as new sign-ins. */
  securityAlerts: boolean
}

export interface NotificationPreferences {
  email: EmailNotificationPreferences
  push: boolean
  /** How often non-urgent notifications are delivered. */
  digest: DigestFrequency
}

export const DIGEST_FREQUENCIES: readonly DigestFrequency[] = [
  'realtime',
  'daily',
  'weekly',
  'none',
]

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email: { trades: true, deposits: true, securityAlerts: true },
  push: true,
  digest: 'realtime',
}

/**
 * Digest delivery is meaningless without a channel to deliver on, so a
 * schedule other than `none` requires at least one enabled channel.
 */
export function isNotificationPreferencesValid(
  preferences: NotificationPreferences,
): boolean {
  const anyChannelEnabled =
    preferences.email.trades ||
    preferences.email.deposits ||
    preferences.email.securityAlerts ||
    preferences.push

  return preferences.digest === 'none' || anyChannelEnabled
}

/**
 * Coerces persisted preferences into the current shape. Handles the legacy
 * `{ email: boolean, push: boolean, sms: boolean }` payload so existing users
 * keep their settings after this change.
 */
export function normalizeNotificationPreferences(
  input: unknown,
): NotificationPreferences {
  if (!input || typeof input !== 'object') {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }

  const raw = input as Record<string, unknown>
  const legacyEmail = typeof raw.email === 'boolean' ? raw.email : undefined
  const emailRaw =
    raw.email && typeof raw.email === 'object'
      ? (raw.email as Record<string, unknown>)
      : {}

  const emailFlag = (
    key: keyof EmailNotificationPreferences,
    fallback: boolean,
  ): boolean => {
    const value = emailRaw[key]
    if (typeof value === 'boolean') return value
    // Legacy payloads stored a single `email` boolean for every category.
    if (legacyEmail !== undefined) return legacyEmail
    return fallback
  }

  const push =
    typeof raw.push === 'boolean'
      ? raw.push
      : legacyEmail !== undefined
        ? legacyEmail
        : DEFAULT_NOTIFICATION_PREFERENCES.push

  const digest =
    typeof raw.digest === 'string' &&
    (DIGEST_FREQUENCIES as readonly string[]).includes(raw.digest)
      ? (raw.digest as DigestFrequency)
      : DEFAULT_NOTIFICATION_PREFERENCES.digest

  return {
    email: {
      trades: emailFlag('trades', DEFAULT_NOTIFICATION_PREFERENCES.email.trades),
      deposits: emailFlag(
        'deposits',
        DEFAULT_NOTIFICATION_PREFERENCES.email.deposits,
      ),
      securityAlerts: emailFlag(
        'securityAlerts',
        DEFAULT_NOTIFICATION_PREFERENCES.email.securityAlerts,
      ),
    },
    push,
    digest,
  }
}

export interface UserPreferences {
  currency?: string
  locale?: string
  theme?: string
  notifications?: NotificationPreferences
}

export interface UpdatePreferencesPayload {
  preferences: string // JSON stringified UserPreferences
}

export type ApiKeyStatus = 'active' | 'rotating' | 'revoked'

export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  scope: string
  isActive: boolean
  status: ApiKeyStatus
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  rotationOfId: string | null
  rotationExpiresAt: string | null
}

export interface CreateApiKeyResult {
  id: string
  key: string
  prefix: string
  scope: string
  createdAt: string
}

export interface RotateApiKeyResult extends CreateApiKeyResult {
  rotationExpiresAt: string
  message: string
}

