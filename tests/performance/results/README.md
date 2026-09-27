# Load test results

Issue #624. One pair of files per scenario per profile, written by `lib/summary.js`:

```
<scenario>-<profile>.json    the diffable record
<scenario>-<profile>.md      a table for the CI job summary
```

## What the JSON holds

```json
{
  "scenario": "dashboard",
  "status": "PASS",
  "profile": "normal",
  "virtualUsers": 100,
  "requests": 12043,
  "throughputRps": 137.42,
  "iterations": 6021,
  "latencyMs": { "p50": 88.1, "p95": 301.4, "p99": 612.9, "avg": 121.6, "max": 1840.2 },
  "errorRate": 0.0004,
  "budgets": { "p95Ms": 500, "errorRate": 0.01, "latencyEnforced": true }
}
```

`status` is derived from the budgets in force for that profile, so a peak run can pass on error rate while its p95 sits above 500ms — that is the intended behaviour, not a bug in the report.

## Committing baselines

Results are generated, so this directory is empty except this file. Commit a run only when you want it as a reference point, and say in the commit message which environment and commit produced it — a latency figure without both is unattributable and will mislead whoever finds it later.

For tracking over time prefer CI artifacts (the workflow uploads every run) over committed files, so history does not fill with numbers taken on whatever machine happened to run them.

## Reading a regression

`throughputRps` is measured over the whole run, ramps included, so it understates steady-state throughput by roughly the ramp fraction. Compare like profile with like profile, never baseline against peak.

A p99 far above p95 with a healthy p95 usually means a small number of slow outliers — a cold cache, a connection pool refill, or one unindexed query on an uncommon path — rather than a general slowdown.
