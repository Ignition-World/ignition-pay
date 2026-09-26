/**
 * Address generation rate-limit config (Issue #422).
 * Address generation is an expensive operation and must be rate-limited
 * per user to prevent abuse. Apply the ThrottlerGuard with these limits
 * on the POST /addresses/generate endpoint.
 */
export const ADDRESS_GENERATION_THROTTLE = {
  /** Maximum number of address generation requests per window. */
  limit: 5,
  /** Time window in milliseconds. */
  ttl: 60_000,
} as const;

export const ADDRESS_GENERATION_THROTTLE_MESSAGE =
  'Too many address generation requests. Please wait before generating a new address.';