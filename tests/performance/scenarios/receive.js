import http from 'k6/http';
import { check } from 'k6';
import {
  WALLET_ID,
  authSkipReason,
  headers,
  optionsFor,
  url,
} from '../lib/config.js';
import { summaryHandlerFor } from '../lib/summary.js';

/**
 * Receive — `GET /wallets/:id` (issue #624).
 *
 * The receive screen needs the wallet's address to render its QR code, so this
 * single read is the whole critical path. It is the cheapest of the five and is
 * useful mainly as a control: if this regresses, the cause is infrastructure
 * rather than any one query.
 */
export const options = optionsFor('receive');
export const handleSummary = summaryHandlerFor('receive');

export function setup() {
  const reason = authSkipReason();
  if (reason) {
    throw new Error(`Cannot run the receive scenario: ${reason}`);
  }
  return {};
}

export default function receive() {
  const res = http.get(url(`/wallets/${WALLET_ID}`), {
    headers: headers(),
    tags: { endpoint: 'wallets/:id' },
  });

  check(res, { 'wallet ok': (r) => r.status === 200 });
}
