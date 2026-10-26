import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // The UI snapshot tests call `expect` without importing it.
    globals: true,
    // No snapshot files are committed for tests/ui yet; vitest refuses to write
    // new snapshots on CI, so let them be recorded there until they are checked in.
    update: Boolean(process.env.CI),
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // #671 — report and enforce coverage. `test:coverage` fails when the global
    // figures drop below the thresholds below, which is the CI gate.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Measure the app's own code, not tests or generated types. Files are
      // only counted once a test has loaded them (vitest's default), so the
      // number reflects real exercised code rather than an inflated `all` run.
      include: [
        'components/**/*.{ts,tsx}',
        'features/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        '**/*.d.ts',
        // Barrel re-exports and constant tables carry no logic to cover.
        '**/index.ts',
        'lib/constants/**',
        // Browser-only plumbing that jsdom cannot exercise: IndexedDB-backed
        // offline queueing and the service-worker/consent bootstraps.
        'lib/transactionQueue.ts',
        'lib/useTransactionQueueProcessor.ts',
        'components/transaction-queue-processor.tsx',
        'components/service-worker-registration.tsx',
        'components/consent-gate.tsx',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
})
