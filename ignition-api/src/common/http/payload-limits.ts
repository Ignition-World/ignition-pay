/**
 * Issue #622 — request body size limits.
 *
 * The API previously registered `express.json()` / `express.urlencoded()`
 * with no `limit` option, so every body was silently capped at express's
 * 100 kB default and the cap itself was invisible: an oversized body surfaced
 * as a `PayloadTooLargeError` thrown from inside the body parser, which never
 * reached a Nest exception filter and therefore returned express's default
 * HTML error page with the raw parse error appended.
 *
 * This module is the single place that defines:
 *   - the default limits (overridable per route via `@MaxBodySize()`),
 *   - the byte-string parser (`'1mb'` / `1048576` / `2 MB`),
 *   - `resolveByteLimit()` and `byteLimitEnvValue()` which are handed straight
 *     to `express.json()` / `express.urlencoded()`.
 *
 * `byteLimitEnvValue()` deliberately returns the *raw* env string so express
 * performs the same normalisation it would apply to its own `limit` option
 * (numbers, `'1mb'`, `'500kb'`, `byte`, `kb`, `mb`, `gb` are all accepted).
 * Values that express cannot parse are rejected at startup instead of being
 * silently coerced to a wrong limit.
 */

/** Default JSON body limit for every route: 1 MB. */
export const DEFAULT_JSON_BODY_LIMIT = '1mb';

/**
 * Default URL-encoded body limit. Larger than the JSON limit because
 * form-encoded bodies are around a third larger than their JSON equivalent
 * for the same payload, but still explicitly bounded.
 */
export const DEFAULT_URLENCODED_BODY_LIMIT = '1mb';

/** Upper bound applied to `@MaxBodySize()` so a route cannot opt out of limiting. */
export const MAX_BODY_SIZE_LIMIT_CEILING = '10mb';

/** Byte units accepted by `parseByteLimit`, matching express's `bytes` package. */
const BYTE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

const BYTE_LIMIT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i;

/**
 * Metadata key used by the `@MaxBodySize()` decorator. Read by
 * `resolveByteLimit()` (request-scoped) and by
 * `PayloadLimitExceptionFilter` (route path lookup).
 */
export const BODY_SIZE_LIMIT_METADATA_KEY = 'http_body_size_limit';

/**
 * Convert an express-style byte string into a byte count.
 *
 * Accepts `1048576`, `'1048576'`, `'1mb'`, `'2 MB'`, `'500kb'`, `'10b'`.
 * Returns `undefined` when the value is missing or cannot be parsed, so
 * callers can tell "not configured" apart from "zero".
 */
export function parseByteLimit(
  value: string | number | undefined | null,
): number | undefined {
  if (value === undefined || value === null) return undefined;

  const raw = typeof value === 'number' ? String(value) : value;
  if (raw.trim() === '') return undefined;

  const match = BYTE_LIMIT_PATTERN.exec(raw);
  if (!match) return undefined;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return undefined;

  const multiplier = match[2] ? BYTE_UNITS[match[2].toLowerCase()] : 1;
  return Math.floor(amount * multiplier);
}

/**
 * Read a body-size override from the environment.
 *
 * Throws when `envVar` holds a value express would not be able to parse — a
 * typo in the environment should fail the start-up (main.ts calls this once at
 * boot for exactly that reason), not silently disable or wildly mis-size the
 * body limit.
 *
 * @returns the raw string (so express does its own normalisation) or
 *          `undefined` when the variable is unset and the caller's default
 *          applies.
 */
export function byteLimitEnvValue(envVar: string): string | undefined {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === '') return undefined;

  if (parseByteLimit(raw) === undefined) {
    throw new Error(
      `${envVar}="${raw}" is not a valid body size limit. ` +
        `Use a byte count (1048576) or a suffixed value such as "1mb", "500kb" or "2MB".`,
    );
  }

  return raw.trim();
}

/**
 * Pick the body limit for a request.
 *
 * Precedence:
 *   1. `@MaxBodySize()` metadata on the handler  — per-route override,
 *      clamped to {@link MAX_BODY_SIZE_LIMIT_CEILING}.
 *   2. `@MaxBodySize()` metadata on the controller — same, class level.
 *   3. the env override for the body type being parsed.
 *   4. the hard-coded default ({@link DEFAULT_JSON_BODY_LIMIT} /
 *      {@link DEFAULT_URLENCODED_BODY_LIMIT}).
 *
 * @param handlerMetadata  metadata read from the route handler.
 * @param classMetadata    metadata read from the controller class.
 * @param envVar           env override for the parser about to run.
 * @param defaultLimit     built-in default for that parser.
 * @param ceiling          highest limit a route may request.
 */
export function resolveByteLimit(
  handlerMetadata: unknown,
  classMetadata: unknown,
  envVar: string,
  defaultLimit: string,
  ceiling: string = MAX_BODY_SIZE_LIMIT_CEILING,
): string {
  const maxBytes = parseByteLimit(ceiling) ?? Number.MAX_SAFE_INTEGER;

  const requested = handlerMetadata ?? classMetadata;
  const requestedBytes = parseByteLimit(
    requested as string | number | undefined,
  );

  if (requestedBytes === undefined) {
    // No (or an unparseable) per-route override — fall back to env/default.
    return byteLimitEnvValue(envVar) ?? defaultLimit;
  }

  // A route can raise the limit but never remove it: the cap is the ceiling.
  return requestedBytes > maxBytes ? ceiling : String(requestedBytes);
}
