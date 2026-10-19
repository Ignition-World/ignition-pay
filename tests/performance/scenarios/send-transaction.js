import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import {
  ALLOW_WRITES,
  WALLET_ID,
  authSkipReason,
  headers,
  optionsFor,
  url,
} from '../lib/config.js';
import { addressForVu, amountFor } from '../lib/fixtures.js';
import { summaryHandlerFor } from '../lib/summary.js';

/**
 * Send transaction — `POST /payments/:walletId` (issue #624).
 *
 * ## Why this one is gated
 *
 * It is the only scenario that mutates state, and the thing it mutates is money.
 * Pointed at the wrong environment a 500-VU run submits 500 concurrent payments,
 * so it refuses to start unless `LOAD_TEST_ALLOW_WRITES=true` is set explicitly.
 *
 * ## What it actually measures
 *
 * Recipients come from the deterministic synthetic pool — well-formed but unfunded
 * keys — so the API rejects them at validation. That is intentional: it measures
 * the write path up to and including validation under load without moving value,
 * and that validation runs on every real payment too. A run that settled 50,000
 * payments on a staging ledger would be measuring Horizon, not this service.
 *
 * 4xx is therefore an expected outcome. 5xx is not, and still counts against the
 * error budget.
 */
export const options = optionsFor('send-transaction');
export const handleSummary = summaryHandlerFor('send-transaction');

const rejected = new Counter('send_rejected_4xx');
const serverErrors = new Counter('send_server_5xx');

export function setup() {
  if (!ALLOW_WRITES) {
    throw new Error(
      'Refusing to run the send-transaction scenario: set LOAD_TEST_ALLOW_WRITES=true ' +
        'to confirm the target environment may receive payment submissions',
    );
  }

  const reason = authSkipReason();
  if (reason) {
    throw new Error(`Cannot run the send-transaction scenario: ${reason}`);
  }

  return {};
}

export default function send() {
  const body = JSON.stringify({
    senderWalletId: WALLET_ID,
    recipientAddress: addressForVu(__VU),
    amount: amountFor(__VU, __ITER),
    assetCode: 'XLM',
  });

  const res = http.post(url(`/payments/${WALLET_ID}`), body, {
    headers: headers({ 'Content-Type': 'application/json' }),
    // Validation rejections are the expected path; server errors are not.
    responseCallback: http.expectedStatuses({ min: 200, max: 499 }),
    tags: { endpoint: 'payments/:walletId' },
  });

  if (res.status >= 400 && res.status < 500) rejected.add(1);
  if (res.status >= 500) serverErrors.add(1);

  check(res, { 'no server error': (r) => r.status < 500 });
}
