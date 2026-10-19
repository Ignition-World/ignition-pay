import { BUDGETS, PROFILE, PROFILES } from './config.js';

/**
 * Summary output for the load suite (issue #624).
 *
 * The issue asks for p50/p95/p99, error rate and throughput to be captured, and
 * for results to live in `tests/performance/results/`. k6's console summary is
 * not diffable, so each run also writes a JSON file with exactly those numbers
 * plus a short markdown table for the CI job summary.
 */

/**
 * Extracts the numbers the budgets are written against.
 *
 * @param {object} data - k6's end-of-test summary object.
 * @returns {object} Flat metrics record.
 */
export function extractMetrics(data) {
  const duration = data.metrics.http_req_duration?.values ?? {};
  const failed = data.metrics.http_req_failed?.values ?? {};
  const reqs = data.metrics.http_reqs?.values ?? {};
  const iterations = data.metrics.iterations?.values ?? {};

  return {
    profile: PROFILE,
    virtualUsers: PROFILES[PROFILE]?.vus ?? null,
    requests: reqs.count ?? 0,
    // Throughput. `rate` is requests per second over the whole run, ramps included.
    throughputRps: round(reqs.rate),
    iterations: iterations.count ?? 0,
    latencyMs: {
      p50: round(duration['p(50)'] ?? duration.med),
      p95: round(duration['p(95)']),
      p99: round(duration['p(99)']),
      avg: round(duration.avg),
      max: round(duration.max),
    },
    errorRate: round(failed.rate, 5),
    budgets: {
      p95Ms: BUDGETS.p95Ms,
      errorRate: BUDGETS.errorRate,
      // Latency is only a gate below peak — see the note in config.js.
      latencyEnforced: PROFILE !== 'peak',
    },
  };
}

function round(value, places = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function verdict(metrics) {
  const errorsOk = metrics.errorRate !== null && metrics.errorRate < BUDGETS.errorRate;
  const latencyOk =
    !metrics.budgets.latencyEnforced ||
    (metrics.latencyMs.p95 !== null && metrics.latencyMs.p95 < BUDGETS.p95Ms);

  return errorsOk && latencyOk ? 'PASS' : 'FAIL';
}

/**
 * Builds a `handleSummary` for one scenario.
 *
 * @param {string} scenario - Scenario name, used in the output filename.
 * @returns {(data: object) => Record<string, string>} k6 summary handler.
 */
export function summaryHandlerFor(scenario) {
  return function handleSummary(data) {
    const metrics = extractMetrics(data);
    const status = verdict(metrics);
    const base = `tests/performance/results/${scenario}-${PROFILE}`;

    const markdown = [
      `### ${scenario} — ${PROFILE} (${metrics.virtualUsers} VUs) — ${status}`,
      '',
      '| Metric | Value | Budget |',
      '| --- | --- | --- |',
      `| p50 | ${fmt(metrics.latencyMs.p50)} ms | — |`,
      `| p95 | ${fmt(metrics.latencyMs.p95)} ms | ${
        metrics.budgets.latencyEnforced ? `< ${BUDGETS.p95Ms} ms` : 'not gated at peak'
      } |`,
      `| p99 | ${fmt(metrics.latencyMs.p99)} ms | — |`,
      `| Error rate | ${fmtPct(metrics.errorRate)} | < ${fmtPct(BUDGETS.errorRate)} |`,
      `| Throughput | ${fmt(metrics.throughputRps)} req/s | — |`,
      `| Requests | ${metrics.requests} | — |`,
      '',
    ].join('\n');

    return {
      [`${base}.json`]: JSON.stringify({ scenario, status, ...metrics }, null, 2),
      [`${base}.md`]: markdown,
      stdout: `\n${markdown}\n`,
    };
  };
}

function fmt(value) {
  return value === null ? 'n/a' : String(value);
}

function fmtPct(rate) {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(2)}%`;
}
