/**
 * Shared configuration for the k6 load suite (issue #624).
 *
 * Every scenario imports its options from here so the three load profiles and
 * the performance budgets are defined once. A budget that is restated per script
 * is a budget that drifts.
 */

/** Base URL of the environment under test. */
export const BASE_URL = (__ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/**
 * Path prefix in front of every route.
 *
 * Empty by default, because `ignition-api/src/main.ts` calls no
 * `setGlobalPrefix`, so the API serves `/auth/challenge` directly. The frontend
 * meanwhile builds URLs with `API_PREFIX = '/api/v1'`
 * (`ignition-pay-frontend/lib/constants/api.ts`), which only resolves if
 * something in front of the API rewrites it. Set LOAD_TEST_API_PREFIX to match
 * whichever is true of the environment you are measuring.
 */
export const API_PREFIX = __ENV.LOAD_TEST_API_PREFIX || '';

/** Session or bearer token for the authenticated scenarios. */
export const AUTH_TOKEN = __ENV.LOAD_TEST_TOKEN || '';

/**
 * API key for routes behind `ApiKeyGuard`.
 *
 * `GET /transactions` is guarded by `ApiKeyGuard` with a `read` scope, so it
 * needs `x-api-key` rather than the bearer token the wallet routes take.
 */
export const API_KEY = __ENV.LOAD_TEST_API_KEY || '';

/** Wallet id the read scenarios exercise. */
export const WALLET_ID = __ENV.LOAD_TEST_WALLET_ID || '';

/**
 * Whether scenarios that mutate state may run.
 *
 * Off by default. A send-payment load test against the wrong environment moves
 * real value, so it has to be switched on deliberately rather than by default.
 */
export const ALLOW_WRITES = __ENV.LOAD_TEST_ALLOW_WRITES === 'true';

/** Load profile, one of `baseline`, `normal` or `peak`. */
export const PROFILE = __ENV.LOAD_TEST_PROFILE || 'baseline';

/**
 * The three profiles the issue specifies.
 *
 * Each ramps up, holds, and ramps down. The hold is where the numbers come from;
 * the ramps keep a cold connection pool from being counted as latency.
 */
export const PROFILES = {
  baseline: { vus: 10, stage: '30s' },
  normal: { vus: 100, stage: '1m' },
  peak: { vus: 500, stage: '1m' },
};

/**
 * Performance budgets.
 *
 * The issue fixes these at 100 concurrent users: p95 under 500ms and an error
 * rate under 1%. Those are enforced for `baseline` and `normal`.
 *
 * `peak` records the same metrics but does not fail on latency. 500 users is
 * five times the level the budget was written for, and a threshold nobody agreed
 * to is a threshold people learn to ignore — the error-rate budget still
 * applies, because dropping requests at peak is a failure at any latency.
 */
export const BUDGETS = {
  p95Ms: 500,
  errorRate: 0.01,
};

/**
 * Builds the k6 options for one scenario.
 *
 * @param {string} name - Scenario name, used in the summary filename.
 * @returns {object} k6 options with stages, thresholds and tags.
 */
export function optionsFor(name) {
  const profile = PROFILES[PROFILE];

  if (!profile) {
    throw new Error(
      `Unknown LOAD_TEST_PROFILE "${PROFILE}". Expected one of: ${Object.keys(
        PROFILES,
      ).join(', ')}`,
    );
  }

  const enforceLatency = PROFILE !== 'peak';

  return {
    stages: [
      { duration: '15s', target: profile.vus },
      { duration: profile.stage, target: profile.vus },
      { duration: '10s', target: 0 },
    ],
    thresholds: {
      // Error rate is enforced at every profile.
      http_req_failed: [`rate<${BUDGETS.errorRate}`],
      // p50 and p99 are reported for trend tracking; only p95 is a gate.
      http_req_duration: enforceLatency
        ? [`p(95)<${BUDGETS.p95Ms}`, 'p(50)>=0', 'p(99)>=0']
        : ['p(50)>=0', 'p(95)>=0', 'p(99)>=0'],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(95)', 'p(99)', 'max'],
    tags: { scenario: name, profile: PROFILE },
  };
}

/**
 * Joins the base URL, optional prefix and a route.
 *
 * @param {string} path - Route beginning with a slash.
 * @returns {string} Absolute URL.
 */
export function url(path) {
  return `${BASE_URL}${API_PREFIX}${path}`;
}

/** Request headers, including auth when a token is configured. */
export function headers(extra = {}) {
  const base = {
    Accept: 'application/json',
    ...extra,
  };

  if (AUTH_TOKEN) {
    base.Authorization = `Bearer ${AUTH_TOKEN}`;
  }

  return base;
}

/**
 * Reports whether an authenticated scenario can run.
 *
 * @returns {string|null} A reason to skip, or null when the scenario can proceed.
 */
export function authSkipReason() {
  if (!AUTH_TOKEN) {
    return 'LOAD_TEST_TOKEN is not set, so authenticated endpoints cannot be measured';
  }
  if (!WALLET_ID) {
    return 'LOAD_TEST_WALLET_ID is not set, so wallet-scoped endpoints cannot be measured';
  }
  return null;
}
