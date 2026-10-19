#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

process.chdir(repoRoot);

const BIN_EXTENSION = process.platform === 'win32' ? '.cmd' : '';
const PRETTIER_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.mdx',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.html',
]);
const ESLINT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
]);
const GENERATED_SEGMENTS = new Set([
  '.git',
  '.next',
  '.dart_tool',
  '.pub',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
]);
const KNOWN_PACKAGES = [
  'ignition-api',
  'ignition-pay-frontend',
  'packages/core-ts',
  'packages/core-dart',
  'ignition-mobile',
  'packages/core-go',
];

const stagedFiles = getStagedFiles().filter(isRelevantFile);

if (stagedFiles.length === 0) {
  console.log('No staged files matched pre-commit checks.');
  process.exit(0);
}

try {
  runRootPrettier();
  runJavascriptChecks('ignition-api', {
    eslint: true,
    prettier: true,
    installHint: 'cd ignition-api && npm install',
  });
  runJavascriptChecks('ignition-pay-frontend', {
    eslint: true,
    prettier: true,
    installHint: 'cd ignition-pay-frontend && npx pnpm install',
  });
  runJavascriptChecks('packages/core-ts', {
    eslint: true,
    prettier: true,
    installHint: 'npx pnpm install',
  });
  runCoreDartChecks();
  runIgnitionMobileChecks();
  runCoreGoChecks();
  process.exit(0);
} catch (error) {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
}

function getStagedFiles() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { encoding: 'utf8' },
  );

  return output
    .split('\u0000')
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => file.split(path.sep).join('/'));
}

function isRelevantFile(file) {
  const segments = file.split('/');
  return !segments.some((segment) => GENERATED_SEGMENTS.has(segment));
}

function runRootPrettier() {
  const files = stagedFiles.filter((file) => {
    if (
      KNOWN_PACKAGES.some((dir) => file === dir || file.startsWith(`${dir}/`))
    ) {
      return false;
    }

    return PRETTIER_EXTENSIONS.has(path.extname(file));
  });

  if (files.length === 0) {
    return;
  }

  const prettierBinary = resolveBinary('', 'prettier', {
    allowRootFallback: true,
  });
  ensureBinary(prettierBinary, 'prettier', 'npm install');

  console.log(
    `→ Formatting ${files.length} root/workspace file(s) with Prettier`,
  );
  runCommand(
    prettierBinary,
    ['--write', '--ignore-unknown', ...files],
    repoRoot,
  );
  restage(files);
}

function runJavascriptChecks(packageDir, options) {
  const packageFiles = stagedFiles.filter(
    (file) => file === packageDir || file.startsWith(`${packageDir}/`),
  );

  if (packageFiles.length === 0) {
    return;
  }

  const cwd = path.join(repoRoot, packageDir);
  const prettierFiles = packageFiles
    .filter((file) => PRETTIER_EXTENSIONS.has(path.extname(file)))
    .map((file) => path.posix.relative(packageDir, file));
  const eslintFiles = packageFiles
    .filter((file) => ESLINT_EXTENSIONS.has(path.extname(file)))
    .map((file) => path.posix.relative(packageDir, file));

  if (options.prettier && prettierFiles.length > 0) {
    const prettierBinary = resolveBinary(packageDir, 'prettier', {
      allowRootFallback: true,
    });
    ensureBinary(prettierBinary, 'prettier', options.installHint);

    console.log(
      `→ Formatting ${prettierFiles.length} file(s) in ${packageDir}`,
    );
    runCommand(
      prettierBinary,
      ['--write', '--ignore-unknown', ...prettierFiles],
      cwd,
    );
    restage(
      packageFiles.filter((file) =>
        PRETTIER_EXTENSIONS.has(path.extname(file)),
      ),
    );
  }

  if (options.eslint && eslintFiles.length > 0) {
    const eslintBinary = resolveBinary(packageDir, 'eslint');
    ensureBinary(eslintBinary, 'eslint', options.installHint);

    console.log(`→ Linting ${eslintFiles.length} file(s) in ${packageDir}`);
    runCommand(eslintBinary, ['--fix', ...eslintFiles], cwd);
    restage(
      packageFiles.filter((file) => ESLINT_EXTENSIONS.has(path.extname(file))),
    );
  }
}

function runCoreDartChecks() {
  const packageDir = 'packages/core-dart';
  const files = stagedFiles.filter((file) => file.startsWith(`${packageDir}/`));
  if (files.length === 0) {
    return;
  }

  const dartFiles = files.filter((file) => path.extname(file) === '.dart');
  if (dartFiles.length > 0) {
    ensureCommand(
      'dart',
      'Install Dart SDK to format and analyze packages/core-dart.',
    );

    console.log(
      `→ Formatting ${dartFiles.length} Dart file(s) in ${packageDir}`,
    );
    runCommand('dart', ['format', ...dartFiles], repoRoot);
    restage(dartFiles);
  }

  ensureCommand('dart', 'Install Dart SDK to analyze packages/core-dart.');
  console.log(`→ Analyzing ${packageDir}`);
  runCommand('dart', ['analyze'], path.join(repoRoot, packageDir));
}

function runIgnitionMobileChecks() {
  const packageDir = 'ignition-mobile';
  const files = stagedFiles.filter((file) => file.startsWith(`${packageDir}/`));
  if (files.length === 0) {
    return;
  }

  const dartFiles = files.filter((file) => path.extname(file) === '.dart');
  if (dartFiles.length > 0) {
    ensureCommand('dart', 'Install Dart SDK to format ignition-mobile files.');

    console.log(
      `→ Formatting ${dartFiles.length} Dart file(s) in ${packageDir}`,
    );
    runCommand('dart', ['format', ...dartFiles], repoRoot);
    restage(dartFiles);
  }

  ensureCommand(
    'flutter',
    'Install Flutter SDK to analyze ignition-mobile changes.',
  );
  console.log(`→ Analyzing ${packageDir}`);
  runCommand(
    'flutter',
    ['analyze', '--no-pub'],
    path.join(repoRoot, packageDir),
  );
}

function runCoreGoChecks() {
  const packageDir = 'packages/core-go';
  const files = stagedFiles.filter((file) => file.startsWith(`${packageDir}/`));
  if (files.length === 0) {
    return;
  }

  const goFiles = files.filter((file) => path.extname(file) === '.go');
  if (goFiles.length > 0) {
    ensureCommand('gofmt', 'Install Go to format packages/core-go files.');

    console.log(`→ Formatting ${goFiles.length} Go file(s) in ${packageDir}`);
    runCommand('gofmt', ['-w', ...goFiles], repoRoot);
    restage(goFiles);
  }

  ensureCommand('go', 'Install Go to validate packages/core-go changes.');
  console.log(`→ Running go test in ${packageDir}`);
  runCommand('go', ['test', './...'], path.join(repoRoot, packageDir));
}

function resolveBinary(
  packageDir,
  binaryName,
  { allowRootFallback = false } = {},
) {
  const candidates = [];
  if (packageDir) {
    candidates.push(
      path.join(
        repoRoot,
        packageDir,
        'node_modules',
        '.bin',
        `${binaryName}${BIN_EXTENSION}`,
      ),
    );
  }
  if (allowRootFallback || !packageDir) {
    candidates.push(
      path.join(
        repoRoot,
        'node_modules',
        '.bin',
        `${binaryName}${BIN_EXTENSION}`,
      ),
    );
  }

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function ensureBinary(binaryPath, binaryName, installHint) {
  if (!binaryPath) {
    throw new Error(
      `Could not find ${binaryName}. Install dependencies first (${installHint}).`,
    );
  }
}

function ensureCommand(command, errorMessage) {
  try {
    execFileSync(command, ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
  } catch {
    throw new Error(errorMessage);
  }
}

function restage(files) {
  if (files.length === 0) {
    return;
  }

  runCommand('git', ['add', '--', ...files], repoRoot);
}

function runCommand(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
