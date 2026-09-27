import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { headers, optionsFor, url } from '../lib/config.js';
import { addressForVu } from '../lib/fixtures.js';
import { summaryHandlerFor } from '../lib/summary.js';

/**
 * Login — `GET /auth/challenge` (issue #624).
 *
 * This is the SEP-10 challenge half of login. The `POST /auth/verify` half needs
 * a real signature over the returned challenge, which k6 cannot produce without a
 * Stellar SDK, so it is out of scope here and noted in the README.
 *
 * ## The rate limit matters more than the latency
 *
 * The endpoint carries `@Throttle({ strict: { limit: 3, ttl: 60_000 } })` — three
 * requests per minute per client. Pointed at an unmodified environment, a 100-VU
 * run therefore measures the throttler: almost every response is a 429, and the
 * error-rate budget fails for a reason that has nothing to do with capacity.
 *
 * So 429 is treated as an expected outcome and counted separately rather than as
 * a failure. A meaningful login throughput figure needs the limit raised on the
 * target environment; until then this scenario tells you the throttle works and
 * how fast it rejects.
 */
export const options = optionsFor('login');
export const handleSummary = summaryHandlerFor('login');

const throttled = new Counter('login_throttled_429');
const accepted = new Counter('login_accepted_200');
const challengeLatency = new Trend('login_challenge_duration', true);

export default function login() {
  const walletAddress = addressForVu(__VU);

  const res = http.get(url(`/auth/challenge?walletAddress=${walletAddress}`), {
    headers: headers(),
    // 429 is an expected response here, not a transport failure.
    responseCallback: http.expectedStatuses(200, 400, 429),
    tags: { endpoint: 'auth/challenge' },
  });

  challengeLatency.add(res.timings.duration);

  if (res.status === 429) throttled.add(1);
  if (res.status === 200) accepted.add(1);

  check(res, {
    'challenge answered': (r) =>
      r.status === 200 || r.status === 400 || r.status === 429,
  });
}
