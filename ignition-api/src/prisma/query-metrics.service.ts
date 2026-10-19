import { Injectable } from '@nestjs/common';

const MAX_SAMPLES_PER_KEY = 1000;

export interface QueryLatencyPercentiles {
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Dependency-free rolling latency tracker for Prisma queries, keyed by
 * `<model>.<action>`. No Prometheus/StatsD client is wired up in this repo
 * yet, so percentiles are computed in-memory and exposed over HTTP instead.
 */
@Injectable()
export class QueryMetricsService {
  private readonly samples = new Map<string, number[]>();

  record(key: string, durationMs: number): void {
    const bucket = this.samples.get(key) ?? [];
    bucket.push(durationMs);
    if (bucket.length > MAX_SAMPLES_PER_KEY) {
      bucket.shift();
    }
    this.samples.set(key, bucket);
  }

  getPercentiles(): Record<string, QueryLatencyPercentiles> {
    const result: Record<string, QueryLatencyPercentiles> = {};

    for (const [key, durations] of this.samples.entries()) {
      const sorted = [...durations].sort((a, b) => a - b);
      result[key] = {
        count: sorted.length,
        p50: this.percentile(sorted, 0.5),
        p95: this.percentile(sorted, 0.95),
        p99: this.percentile(sorted, 0.99),
      };
    }

    return result;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.min(
      sorted.length - 1,
      Math.ceil(p * sorted.length) - 1,
    );
    return sorted[Math.max(index, 0)];
  }
}
