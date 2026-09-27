import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import {
  WALLET_ID,
  authSkipReason,
  headers,
  optionsFor,
  url,
} from '../lib/config.js';
import { summaryHandlerFor } from '../lib/summary.js';

/**
 * Dashboard — the wallet list plus one balance read (issue #624).
 *
 * These are the two calls the dashboard makes on load, measured together, because
 * the number a user experiences is the sum and not either half.
 */
export const options = optionsFor('dashboard');
export const handleSummary = summaryHandlerFor('dashboard');

const listLatency = new Trend('dashboard_wallets_duration', true);
const balanceLatency = new Trend('dashboard_balance_duration', true);

export function setup() {
  const reason = authSkipReason();
  if (reason) {
    // Fail loudly rather than reporting a green run that measured nothing.
    throw new Error(`Cannot run the dashboard scenario: ${reason}`);
  }
  return {};
}

export default function dashboard() {
  const list = http.get(url('/wallets'), {
    headers: headers(),
    tags: { endpoint: 'wallets' },
  });
  listLatency.add(list.timings.duration);
  check(list, { 'wallet list ok': (r) => r.status === 200 });

  const balance = http.get(url(`/wallets/${WALLET_ID}/balance`), {
    headers: headers(),
    tags: { endpoint: 'wallets/:id/balance' },
  });
  balanceLatency.add(balance.timings.duration);
  check(balance, { 'balance ok': (r) => r.status === 200 });
}
