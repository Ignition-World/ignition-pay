import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { API_KEY, headers, optionsFor, url } from '../lib/config.js';
import { pageSizeFor } from '../lib/fixtures.js';
import { summaryHandlerFor } from '../lib/summary.js';

/**
 * Transaction history — `GET /transactions` (issue #624).
 *
 * Authenticated with `x-api-key`, not a bearer token: the route is guarded by
 * `ApiKeyGuard` and `RequireScope('read')`, so a session token is rejected.
 *
 * Page size varies deterministically across 10/25/50 so the run exercises more
 * than one query shape. A fixed page size lets one cached plan flatter the result.
 */
export const options = optionsFor('transaction-history');
export const handleSummary = summaryHandlerFor('transaction-history');

const byPageSize = new Trend('history_duration_by_page', true);

export function setup() {
  if (!API_KEY) {
    throw new Error(
      'Cannot run the transaction-history scenario: LOAD_TEST_API_KEY is not set, ' +
        'and GET /transactions is behind ApiKeyGuard with a read scope',
    );
  }
  return {};
}

export default function history() {
  const limit = pageSizeFor(__ITER);

  const res = http.get(url(`/transactions?page=1&limit=${limit}`), {
    headers: headers({ 'x-api-key': API_KEY }),
    tags: { endpoint: 'transactions', limit: String(limit) },
  });

  byPageSize.add(res.timings.duration, { limit: String(limit) });

  check(res, { 'history ok': (r) => r.status === 200 });
}
