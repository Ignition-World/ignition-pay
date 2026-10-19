#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  console.log('Git hooks configured to use .githooks');
} catch {
  console.log(
    'Skipping git hook setup because this directory is not a Git worktree.',
  );
}
