import { NotificationType } from '@prisma/client';

export type NotificationChannel = 'email' | 'push' | 'inApp';

export type ChannelPreferences = Record<NotificationChannel, boolean>;

export type NotificationPreferences = Record<
  NotificationType,
  ChannelPreferences
>;

/**
 * Notification types that are always delivered on every channel — payment
 * and dispute (security-relevant) events aren't user-suppressible.
 */
const IMPORTANT_TYPES: NotificationType[] = [
  NotificationType.DONATION_RECEIVED,
  NotificationType.DISPUTE_FILED,
  NotificationType.DISPUTE_RESOLVED,
];

const ALL_ENABLED: ChannelPreferences = {
  email: true,
  push: true,
  inApp: true,
};

export function defaultNotificationPreferences(): NotificationPreferences {
  const defaults = {} as NotificationPreferences;
  for (const type of Object.values(NotificationType)) {
    defaults[type] = { ...ALL_ENABLED };
  }
  return defaults;
}

/** Merge a partial/stored preference object over the defaults, forcing important types on. */
export function normalizeNotificationPreferences(
  stored: unknown,
): NotificationPreferences {
  const merged = defaultNotificationPreferences();
  const storedObj =
    stored && typeof stored === 'object'
      ? (stored as Record<string, Partial<ChannelPreferences>>)
      : {};

  for (const type of Object.values(NotificationType)) {
    const storedChannels = storedObj[type];
    if (storedChannels) {
      merged[type] = {
        email: storedChannels.email ?? merged[type].email,
        push: storedChannels.push ?? merged[type].push,
        inApp: storedChannels.inApp ?? merged[type].inApp,
      };
    }
  }

  for (const type of IMPORTANT_TYPES) {
    merged[type] = { ...ALL_ENABLED };
  }

  return merged;
}

export function isChannelEnabled(
  preferences: NotificationPreferences,
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  if (IMPORTANT_TYPES.includes(type)) {
    return true;
  }
  return preferences[type]?.[channel] ?? true;
}
