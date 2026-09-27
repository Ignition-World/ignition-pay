/**
 * Deterministic fixtures for the load suite (issue #624).
 *
 * "Reproducible and self-contained" is the requirement, so nothing here reads a
 * database, calls a seeding endpoint, or uses `Math.random()`. Every value is
 * derived from a fixed seed, which means run N produces exactly the inputs run
 * N produced last week and two runs can be compared without wondering whether
 * the data changed underneath them.
 */

/** Fixed seed. Changing it changes every generated fixture, so don't, casually. */
const SEED = 0x1f2e3d4c;

/**
 * Deterministic 32-bit PRNG (mulberry32).
 *
 * k6 has no seedable random, and `Math.random()` would make each run's inputs
 * different, so a load result could move because the data moved rather than
 * because the service did.
 *
 * @param {number} seed - Starting state.
 * @returns {() => number} Generator producing floats in [0, 1).
 */
export function seededRandom(seed = SEED) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STELLAR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Builds a syntactically plausible Stellar public key for a given index.
 *
 * Deliberately not a real, funded account: these are for exercising request
 * parsing and validation paths under load, not for moving value. Requests using
 * them are expected to be rejected by the API's own validation, which is itself
 * worth measuring — validation is on the hot path of every write.
 *
 * @param {number} index - Stable index; the same index always yields the same key.
 * @returns {string} A 56-character G-prefixed key.
 */
export function syntheticAddress(index) {
  const next = seededRandom(SEED + index);
  let body = '';

  for (let i = 0; i < 55; i += 1) {
    body += STELLAR_ALPHABET[Math.floor(next() * STELLAR_ALPHABET.length)];
  }

  return `G${body}`;
}

/** A fixed pool of addresses, indexed by virtual user. */
export function addressForVu(vuId) {
  return syntheticAddress(vuId % 64);
}

/**
 * Deterministic payment amount for a virtual user and iteration.
 *
 * Kept small and varied so the amount column is not constant, which would let a
 * cache or a query plan flatter the results.
 *
 * @param {number} vuId - Virtual user id.
 * @param {number} iteration - Iteration within that user.
 * @returns {string} Amount with seven decimal places, as Stellar expects.
 */
export function amountFor(vuId, iteration) {
  const next = seededRandom(SEED + vuId * 1000 + iteration);
  return (0.1 + next() * 9.9).toFixed(7);
}

/** Page sizes the history scenario cycles through. */
export const HISTORY_PAGE_SIZES = [10, 25, 50];

/**
 * Page size for an iteration, cycling deterministically.
 *
 * @param {number} iteration - Iteration counter.
 * @returns {number} One of {@link HISTORY_PAGE_SIZES}.
 */
export function pageSizeFor(iteration) {
  return HISTORY_PAGE_SIZES[iteration % HISTORY_PAGE_SIZES.length];
}
