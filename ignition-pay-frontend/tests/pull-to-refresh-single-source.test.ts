import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Single-source guard for the `PullToRefresh` component (issue #886).
 *
 * `components/pull-to-refresh1.tsx` was a near-duplicate of
 * `components/pull-to-refresh.tsx`. Both exported `PullToRefresh`, both wrapped
 * the same `usePullToRefresh` hook, and they had already diverged: the "1" copy
 * grew a `threshold` prop and a floating pill indicator, while every consumer
 * imports the other one.
 *
 * Nothing referenced the duplicate — `features/dashboard/widgets/DashboardPage.tsx`
 * imports `@/components/pull-to-refresh` — so it could only rot, or be picked up
 * by mistake, which is exactly the divergent behaviour the issue describes.
 *
 * A duplicate only stays harmless while nobody imports it, so this asserts the
 * property that actually matters: exactly one module in the app declares the
 * component, and every import resolves to it. Adding a second declaration, or
 * pointing an import at one, fails here rather than in review.
 */

const ROOT = process.cwd();
const SOURCE_DIRS = ['app', 'components', 'features', 'hooks', 'lib'];
const CANONICAL = 'components/pull-to-refresh.tsx';

function collectSourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') return [];
      return collectSourceFiles(fullPath);
    }
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) return [];
    return [fullPath];
  });
}

function sourceFiles(): string[] {
  return SOURCE_DIRS.flatMap((dir) => collectSourceFiles(join(ROOT, dir)));
}

function relativeToRoot(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

/** Files that declare a `PullToRefresh` export, however it is exported. */
function declaringFiles(): string[] {
  const DECLARATION =
    /export\s+(?:default\s+)?(?:function|const|class)\s+PullToRefresh\b/;

  return sourceFiles()
    .filter((file) => DECLARATION.test(readFileSync(file, 'utf8')))
    .map(relativeToRoot)
    .sort();
}

/** Module names that an import of a `components/pull-to-refresh*` module resolves to. */
function importedModuleNames(): string[] {
  const SPECIFIER = /from\s+['"]([^'"]+)['"]/g;
  const TARGET = /(?:^|\/)components\/(pull-to-refresh[a-z0-9.-]*)$/;
  const names = new Set<string>();

  for (const file of sourceFiles()) {
    const contents = readFileSync(file, 'utf8');
    for (const [, specifier] of contents.matchAll(SPECIFIER)) {
      const normalised = specifier.replace(/^@\//, '');
      const match = normalised.match(TARGET);
      if (match) names.add(match[1]);
    }
  }

  return [...names].sort();
}

describe('PullToRefresh is defined once', () => {
  it('declares the component in exactly one module', () => {
    expect(declaringFiles()).toEqual([CANONICAL]);
  });

  it('resolves every import of it to that module', () => {
    expect(importedModuleNames()).toEqual(['pull-to-refresh']);
  });
});
