# Load tests and performance budgets

Issue #624. A [k6](https://k6.io) suite covering the five endpoints on the critical path, with the budgets CI enforces.

k6 rather than Artillery because thresholds are a first-class concept: a budget is declared in the script and a breach makes the process exit non-zero, so "CI fails if budgets are exceeded" needs no extra glue.

## Layout

```
tests/performance/
  lib/config.js      load profiles, budgets, URL and auth helpers
  lib/fixtures.js    deterministic, self-contained test data
  lib/summary.js     writes p50/p95/p99, error rate and throughput to results/
  scenarios/         one script per endpoint
  results/           JSON + markdown, one pair per scenario per profile
```

## Running

Install k6 (`brew install k6`, `winget install k6`, or see the k6 docs), then:

```bash
# Baseline, 10 VUs, against a local API
LOAD_TEST_BASE_URL=http://localhost:3000 \
  k6 run tests/performance/scenarios/login.js

# Normal load, 100 VUs — the level the budgets are written for
LOAD_TEST_BASE_URL=https://staging.example \
LOAD_TEST_PROFILE=normal \
LOAD_TEST_TOKEN="$STAGING_SESSION_TOKEN" \
LOAD_TEST_WALLET_ID="$STAGING_WALLET_ID" \
  k6 run tests/performance/scenarios/dashboard.js
```

Run from the repository root so `results/` paths resolve.

## Configuration

| Variable | Purpose |
| --- | --- |
| `LOAD_TEST_BASE_URL` | Environment under test. Defaults to `http://localhost:3000`. |
| `LOAD_TEST_API_PREFIX` | Path prefix. Empty by default — see the note below. |
| `LOAD_TEST_PROFILE` | `baseline` (10 VUs), `normal` (100), `peak` (500). |
| `LOAD_TEST_TOKEN` | Bearer token for the wallet routes. |
| `LOAD_TEST_API_KEY` | `x-api-key` for `GET /transactions`. |
| `LOAD_TEST_WALLET_ID` | Wallet the read scenarios address. |
| `LOAD_TEST_ALLOW_WRITES` | Must be `"true"` for `send-transaction.js` to start. |

Nothing has a default that points at a real environment, and no credential is committed. Scenarios that need auth fail in `setup()` with the reason, rather than running and reporting a green result that measured a wall of 401s.

## Load profiles

| Profile | VUs | Hold | Budgets enforced |
| --- | --- | --- | --- |
| `baseline` | 10 | 30s | p95 < 500ms, errors < 1% |
| `normal` | 100 | 1m | p95 < 500ms, errors < 1% |
| `peak` | 500 | 1m | errors < 1% only |

Each profile ramps for 15s, holds, then ramps down for 10s. The hold produces the numbers; the ramp keeps a cold connection pool out of the latency figure.

Latency is not gated at peak. 500 users is five times the level the budget was written for, so failing the build on it would assert a target nobody agreed to — and a threshold people expect to be red is a threshold they stop reading. The error-rate budget still applies, because dropping requests is a failure at any latency.

## The five scenarios

| Scenario | Endpoint | Notes |
| --- | --- | --- |
| `login` | `GET /auth/challenge` | Rate-limited; see below |
| `dashboard` | `GET /wallets` + `GET /wallets/:id/balance` | Both calls, measured together |
| `send-transaction` | `POST /payments/:walletId` | Gated behind `LOAD_TEST_ALLOW_WRITES` |
| `receive` | `GET /wallets/:id` | Cheapest read; a control for infrastructure drift |
| `transaction-history` | `GET /transactions` | Needs `x-api-key`; cycles page sizes 10/25/50 |

## Three things to know before trusting a number

**Login is throttled to three requests a minute.** `GET /auth/challenge` carries `@Throttle({ strict: { limit: 3, ttl: 60_000 } })`. Against an unmodified environment a 100-VU run measures the throttler, not login: nearly every response is a 429. The scenario treats 429 as expected and counts it separately (`login_throttled_429`) so the error budget is not failed by a working rate limit, but a real login throughput figure needs the limit raised on the target environment first.

**`POST /auth/verify` is not covered.** It needs a signature over the challenge, and k6 cannot sign without a Stellar SDK. The measured half is the challenge issue, which is the part that touches the database.

**Send measures validation, not settlement.** Recipients are well-formed but unfunded synthetic keys, so payments are rejected at validation. That is deliberate — it loads the write path without moving value, and validation runs on every real payment too. `send_rejected_4xx` counts those; `send_server_5xx` counts genuine failures, and only the latter breaches the budget.

## A discrepancy worth resolving

`ignition-api/src/main.ts` sets no global prefix, so the API serves `/auth/challenge`. The frontend builds URLs from `API_PREFIX = '/api/v1'` (`ignition-pay-frontend/lib/constants/api.ts`), which only resolves if something in front of the API rewrites it. `LOAD_TEST_API_PREFIX` defaults to empty, matching the API as written. If staging really serves under `/api/v1`, set it — and the mismatch is worth fixing at the source.

## Fixtures

`lib/fixtures.js` derives every value from a fixed seed through a mulberry32 PRNG. k6 has no seedable random, and `Math.random()` would make each run's inputs different, so a result could move because the data moved rather than because the service did. Same seed, same addresses, same amounts, same page sizes, every run — which is what makes two runs comparable.

No database seeding, no fixture endpoint, no network dependency beyond the service itself.

## Verifying the suite itself

The k6 scripts need k6, but the parts that decide whether a run passes — the deterministic fixtures, the thresholds and the summary arithmetic — are plain JavaScript and are checked without it:

```bash
node --test tests/performance/lib/lib.test.mjs tests/performance/lib/lib.peak.test.mjs
```

28 cases. A budget computed wrongly is worse than no budget, because it reports green.

`node --test` rather than jest because these modules are native ESM and the repository already uses it for `scripts/version-utils.test.mjs`. The peak cases live in their own file on purpose: `config.js` captures `__ENV` at module load, so one process can only observe one profile — which is also how k6 runs.

## Results

Each run writes `results/<scenario>-<profile>.json` and `.md`. The JSON is the diffable record — p50/p95/p99, error rate, throughput, request count, the budgets in force and a PASS/FAIL verdict. See `results/README.md`.
