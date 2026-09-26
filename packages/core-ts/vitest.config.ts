import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"], coverage: { provider: "v8", include: ["src/**/*.ts"], exclude: ["**/*.test.ts", "**/*.spec.ts", "dist/**"], thresholds: { lines: 80, statements: 80, functions: 75, branches: 80 } } } });
