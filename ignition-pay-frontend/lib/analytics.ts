// lib/analytics.ts

export type AnalyticsEvent =
  | "send_initiated"
  | "send_completed"
  | "receive_opened"
  | "asset_swapped"
  | "settings_changed";

export interface AnalyticsProperties {
  assetType?: string;
  amount?: string | number;
  success?: boolean;
  [key: string]: unknown;
}

const isProduction =
  typeof import.meta !== "undefined"
    ? import.meta.env?.PROD === true
    : process.env.NODE_ENV === "production";

/**
 * Fire analytics without ever blocking or breaking the user flow.
 */
export function track(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): void {
  if (!isProduction) {
    return;
  }

  // Never let analytics failures affect application UX.
  void Promise.resolve()
    .then(() => {
      // Replace this with the existing analytics provider call.
      // Example:
      //
      // analytics.track(event, properties);
      //
      // Keeping the provider behind this utility means feature pages
      // don't need to know which analytics service is being used.
      sendToAnalyticsProvider(event, properties);
    })
    .catch(() => {
      // Analytics must never break the application.
    });
}

function sendToAnalyticsProvider(
  event: AnalyticsEvent,
  properties: AnalyticsProperties,
): void {
  // Existing analytics implementation should go here.
  //
  // For example, if the project already has:
  //
  // analytics.track(event, properties);
  //
  // call it here instead.
}
