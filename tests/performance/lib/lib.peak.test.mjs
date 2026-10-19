import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

/**
 * Peak-profile summary behaviour (issue #624).
 *
 * A separate file because `node --test` gives each file its own process, and
 * `config.js` captures `__ENV` at module load — so a profile cannot be changed
 * once anything has imported it. One process per profile is also how k6 itself
 * runs, so this mirrors reality rather than working around it.
 */

before(() => {
  globalThis.__ENV = { LOAD_TEST_PROFILE: 'peak' };
});

after(() => {
  delete globalThis.__ENV;
});

function k6Summary({ p95 = 300, failRate = 0 } = {}) {
  return {
    metrics: {
      http_req_duration: {
        values: { 'p(50)': 80, 'p(95)': p95, 'p(99)': 600, avg: 120, max: 900, med: 80 },
      },
      http_req_failed: { values: { rate: failRate } },
      http_reqs: { values: { count: 1000, rate: 100 } },
      iterations: { values: { count: 500 } },
    },
  };
}

describe('summary (peak profile)', () => {
  it('records 500 virtual users', async () => {
    const { extractMetrics } = await import('./summary.js');

    assert.equal(extractMetrics(k6Summary()).virtualUsers, 500);
  });

  it('does not gate latency at peak', async () => {
    const { summaryHandlerFor } = await import('./summary.js');

    const output = summaryHandlerFor('dashboard')(k6Summary({ p95: 1200 }));
    const report = JSON.parse(
      output['tests/performance/results/dashboard-peak.json'],
    );

    // Five times the level the budget was written for; latency is reported, not enforced.
    assert.equal(report.status, 'PASS');
    assert.equal(report.budgets.latencyEnforced, false);
    assert.equal(report.latencyMs.p95, 1200);
  });

  it('still fails peak when requests are being dropped', async () => {
    const { summaryHandlerFor } = await import('./summary.js');

    const output = summaryHandlerFor('dashboard')(k6Summary({ failRate: 0.05 }));
    const report = JSON.parse(
      output['tests/performance/results/dashboard-peak.json'],
    );

    assert.equal(report.status, 'FAIL');
  });

  it('says latency is not gated in the markdown table', async () => {
    const { summaryHandlerFor } = await import('./summary.js');

    const output = summaryHandlerFor('dashboard')(k6Summary());

    assert.match(
      output['tests/performance/results/dashboard-peak.md'],
      /not gated at peak/,
    );
  });
});
