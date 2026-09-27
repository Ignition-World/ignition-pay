import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

/**
 * Verification for the load suite's own logic (issue #624).
 *
 * The k6 scripts cannot run without k6, but the parts that decide whether a run
 * passes — the fixtures, the thresholds and the summary arithmetic — are plain
 * JavaScript and are worth checking. A budget that is computed wrongly is worse
 * than no budget, because it reports green.
 *
 * Uses `node --test` rather than jest: these modules are native ESM, and the
 * repository already runs `node --test` for `scripts/version-utils.test.mjs`.
 * (The root jest config globs `**\/tests\/**`, which picks up the frontend's
 * vitest suites and fails for reasons unrelated to this suite.)
 *
 *   node --test tests/performance/lib/
 */

// k6 injects __ENV. Stand it up before importing anything that reads it.
before(() => {
  globalThis.__ENV = {};
});

after(() => {
  delete globalThis.__ENV;
});

async function loadConfig(env = {}) {
  globalThis.__ENV = env;
  // Cache-bust so each case re-reads __ENV at module scope.
  return import(`./config.js?case=${Math.random()}`);
}

describe('fixtures', () => {
  it('produces the same sequence for the same seed', async () => {
    const { seededRandom } = await import('./fixtures.js');

    const a = seededRandom(123);
    const b = seededRandom(123);

    const first = [a(), a(), a()];
    const second = [b(), b(), b()];

    assert.deepEqual(first, second);
  });

  it('produces different sequences for different seeds', async () => {
    const { seededRandom } = await import('./fixtures.js');

    assert.notEqual(seededRandom(1)(), seededRandom(2)());
  });

  it('stays inside [0, 1)', async () => {
    const { seededRandom } = await import('./fixtures.js');
    const next = seededRandom(99);

    for (let i = 0; i < 500; i += 1) {
      const value = next();
      assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
    }
  });

  it('builds 56-character G-prefixed addresses from the Stellar alphabet', async () => {
    const { syntheticAddress } = await import('./fixtures.js');
    const address = syntheticAddress(7);

    assert.equal(address.length, 56);
    assert.match(address, /^G[A-Z2-7]{55}$/);
  });

  it('gives the same address for the same index, every run', async () => {
    const { syntheticAddress } = await import('./fixtures.js');

    assert.equal(syntheticAddress(7), syntheticAddress(7));
    assert.notEqual(syntheticAddress(7), syntheticAddress(8));
  });

  it('wraps the address pool at 64 entries', async () => {
    const { addressForVu } = await import('./fixtures.js');

    assert.equal(addressForVu(1), addressForVu(65));
    assert.notEqual(addressForVu(1), addressForVu(2));
  });

  it('builds deterministic amounts with seven decimal places', async () => {
    const { amountFor } = await import('./fixtures.js');
    const amount = amountFor(3, 4);

    assert.equal(amount, amountFor(3, 4));
    assert.match(amount, /^\d+\.\d{7}$/);

    const value = Number(amount);
    assert.ok(value >= 0.1 && value <= 10, `unexpected amount: ${amount}`);
  });

  it('cycles the history page sizes', async () => {
    const { pageSizeFor, HISTORY_PAGE_SIZES } = await import('./fixtures.js');

    assert.equal(pageSizeFor(0), HISTORY_PAGE_SIZES[0]);
    assert.equal(pageSizeFor(1), HISTORY_PAGE_SIZES[1]);
    assert.equal(pageSizeFor(2), HISTORY_PAGE_SIZES[2]);
    assert.equal(pageSizeFor(3), HISTORY_PAGE_SIZES[0]);
  });
});

describe('config', () => {
  it('defaults to the baseline profile', async () => {
    const config = await loadConfig();

    assert.equal(config.PROFILE, 'baseline');
    assert.equal(config.PROFILES.baseline.vus, 10);
    assert.equal(config.PROFILES.normal.vus, 100);
    assert.equal(config.PROFILES.peak.vus, 500);
  });

  it('holds the budgets the issue specifies', async () => {
    const { BUDGETS } = await loadConfig();

    assert.equal(BUDGETS.p95Ms, 500);
    assert.equal(BUDGETS.errorRate, 0.01);
  });

  it('gates latency below peak and only error rate at peak', async () => {
    const normal = await loadConfig({ LOAD_TEST_PROFILE: 'normal' });
    const normalThresholds = normal.optionsFor('x').thresholds;

    assert.ok(normalThresholds.http_req_duration.includes('p(95)<500'));
    assert.deepEqual(normalThresholds.http_req_failed, ['rate<0.01']);

    const peak = await loadConfig({ LOAD_TEST_PROFILE: 'peak' });
    const peakThresholds = peak.optionsFor('x').thresholds;

    assert.ok(!peakThresholds.http_req_duration.some((t) => t.includes('<500')));
    // Dropping requests is a failure at any latency.
    assert.deepEqual(peakThresholds.http_req_failed, ['rate<0.01']);
  });

  it('ramps up, holds, then ramps down', async () => {
    const { optionsFor } = await loadConfig({ LOAD_TEST_PROFILE: 'normal' });
    const { stages } = optionsFor('x');

    assert.equal(stages.length, 3);
    assert.equal(stages[0].target, 100);
    assert.equal(stages[1].target, 100);
    assert.equal(stages[2].target, 0);
  });

  it('rejects an unknown profile instead of silently using a default', async () => {
    const { optionsFor } = await loadConfig({ LOAD_TEST_PROFILE: 'enormous' });

    assert.throws(() => optionsFor('x'), /Unknown LOAD_TEST_PROFILE/);
  });

  it('joins base URL, prefix and route, and trims a trailing slash', async () => {
    const { url } = await loadConfig({
      LOAD_TEST_BASE_URL: 'https://staging.example/',
      LOAD_TEST_API_PREFIX: '/api/v1',
    });

    assert.equal(url('/wallets'), 'https://staging.example/api/v1/wallets');
  });

  it('omits the prefix by default, matching the API as written', async () => {
    const { url } = await loadConfig({ LOAD_TEST_BASE_URL: 'https://staging.example' });

    assert.equal(url('/auth/challenge'), 'https://staging.example/auth/challenge');
  });

  it('adds a bearer header only when a token is configured', async () => {
    const without = await loadConfig();
    assert.equal(without.headers().Authorization, undefined);

    const with_ = await loadConfig({ LOAD_TEST_TOKEN: 'tok' });
    assert.equal(with_.headers().Authorization, 'Bearer tok');
  });

  it('explains why an authenticated scenario cannot run', async () => {
    const noToken = await loadConfig();
    assert.match(noToken.authSkipReason(), /LOAD_TEST_TOKEN/);

    const noWallet = await loadConfig({ LOAD_TEST_TOKEN: 'tok' });
    assert.match(noWallet.authSkipReason(), /LOAD_TEST_WALLET_ID/);

    const ready = await loadConfig({
      LOAD_TEST_TOKEN: 'tok',
      LOAD_TEST_WALLET_ID: 'w1',
    });
    assert.equal(ready.authSkipReason(), null);
  });

  it('keeps writes off unless explicitly enabled', async () => {
    assert.equal((await loadConfig()).ALLOW_WRITES, false);
    assert.equal(
      (await loadConfig({ LOAD_TEST_ALLOW_WRITES: 'yes' })).ALLOW_WRITES,
      false,
    );
    assert.equal(
      (await loadConfig({ LOAD_TEST_ALLOW_WRITES: 'true' })).ALLOW_WRITES,
      true,
    );
  });
});

function k6Summary({ p50 = 80, p95 = 300, p99 = 600, failRate = 0, reqs = 1000, rps = 100 } = {}) {
  return {
    metrics: {
      http_req_duration: {
        values: { 'p(50)': p50, 'p(95)': p95, 'p(99)': p99, avg: 120, max: 900, med: p50 },
      },
      http_req_failed: { values: { rate: failRate } },
      http_reqs: { values: { count: reqs, rate: rps } },
      iterations: { values: { count: reqs / 2 } },
    },
  };
}

/**
 * These run under the `normal` profile.
 *
 * `summary.js` imports `./config.js` by a plain specifier, and config captures
 * `__ENV` at module load, so a single process can only observe one profile
 * however many times summary is re-imported. That is exactly how k6 runs — one
 * process per profile — so the peak assertions live in `lib.peak.test.mjs`,
 * which `node --test` runs in its own process.
 */
describe('summary (normal profile)', () => {
  it('extracts the metrics the budgets are written against', async () => {
    globalThis.__ENV = { LOAD_TEST_PROFILE: 'normal' };
    const { extractMetrics } = await import(`./summary.js?case=${Math.random()}`);

    const metrics = extractMetrics(k6Summary({ p50: 88.123, failRate: 0.0004 }));

    assert.equal(metrics.profile, 'normal');
    assert.equal(metrics.virtualUsers, 100);
    assert.equal(metrics.latencyMs.p50, 88.12);
    assert.equal(metrics.latencyMs.p95, 300);
    assert.equal(metrics.latencyMs.p99, 600);
    assert.equal(metrics.errorRate, 0.0004);
    assert.equal(metrics.throughputRps, 100);
    assert.equal(metrics.requests, 1000);
    assert.equal(metrics.budgets.latencyEnforced, true);
  });

  it('writes a result file per scenario and profile', async () => {
    globalThis.__ENV = { LOAD_TEST_PROFILE: 'normal' };
    const { summaryHandlerFor } = await import(`./summary.js?case=${Math.random()}`);

    const output = summaryHandlerFor('dashboard')(k6Summary());

    assert.ok('tests/performance/results/dashboard-normal.json' in output);
    assert.ok('tests/performance/results/dashboard-normal.md' in output);
  });

  it('passes a run inside both budgets', async () => {
    globalThis.__ENV = { LOAD_TEST_PROFILE: 'normal' };
    const { summaryHandlerFor } = await import(`./summary.js?case=${Math.random()}`);

    const output = summaryHandlerFor('dashboard')(
      k6Summary({ p95: 300, failRate: 0.001 }),
    );
    const report = JSON.parse(output['tests/performance/results/dashboard-normal.json']);

    assert.equal(report.status, 'PASS');
  });

  it('fails a run over the latency budget', async () => {
    globalThis.__ENV = { LOAD_TEST_PROFILE: 'normal' };
    const { summaryHandlerFor } = await import(`./summary.js?case=${Math.random()}`);

    const output = summaryHandlerFor('dashboard')(k6Summary({ p95: 501 }));
    const report = JSON.parse(output['tests/performance/results/dashboard-normal.json']);

    assert.equal(report.status, 'FAIL');
  });

  it('fails a run over the error budget', async () => {
    globalThis.__ENV = { LOAD_TEST_PROFILE: 'normal' };
    const { summaryHandlerFor } = await import(`./summary.js?case=${Math.random()}`);

    const output = summaryHandlerFor('dashboard')(k6Summary({ failRate: 0.02 }));
    const report = JSON.parse(output['tests/performance/results/dashboard-normal.json']);

    assert.equal(report.status, 'FAIL');
  });

  it('reports n/a rather than crashing on a run with no requests', async () => {
    globalThis.__ENV = { LOAD_TEST_PROFILE: 'baseline' };
    const { extractMetrics } = await import(`./summary.js?case=${Math.random()}`);

    const metrics = extractMetrics({ metrics: {} });

    assert.equal(metrics.requests, 0);
    assert.equal(metrics.latencyMs.p95, null);
    assert.equal(metrics.errorRate, null);
  });
});
