import { BadRequestException } from '@nestjs/common';

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters without using common, sequential, or account-related patterns';

interface PasswordContext {
  email?: string | null;
  walletAddress?: string | null;
  displayName?: string | null;
  name?: string | null;
}

/**
 * Top-100 most common breached passwords (subset).
 * Matched case-insensitively against the normalised input.
 *
 * Issue #403 — block commonly breached / easily-guessed passwords
 * that pass basic complexity rules (e.g. "P@ssw0rd123!").
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  'p@ssword', 'p@ssw0rd', 'p@ssw0rd!', 'p@ssword1', 'p@ssword12',
  'letmein', 'letmein1', 'letmein12', 'letmein123',
  'qwerty', 'qwerty1', 'qwerty12', 'qwerty123', 'qwerty1234',
  'abc123', 'abc1234', 'abc12345',
  '123456', '1234567', '12345678', '123456789', '1234567890',
  'admin', 'admin1', 'admin12', 'admin123',
  'welcome', 'welcome1', 'welcome12',
  'monkey', 'dragon', 'master', 'login', 'mustang',
  'shadow', 'sunshine', 'trustno1', 'iloveyou',
  'baseball', 'football', 'batman', 'access', 'hello',
  'charlie', 'donald', 'password!', 'changeme',
  'summer', 'winter', 'spring', 'fall',
  'stellar', 'stellar1', 'xlm', 'crypto',
]);

/** Keyboard-sequential patterns (lowercase, length >= 4) */
const SEQUENTIAL_PATTERNS = [
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  '01234567890',
  '09876543210',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'qazwsx',
];

export function assertStrongPassword(
  password: string,
  context: PasswordContext,
): void {
  if (
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }

  // Issue #403 — Block common / breached passwords
  if (isCommonPassword(password)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }

  // Issue #403 — Block sequential / keyboard patterns
  if (hasSequentialPattern(password)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }

  // Block account-related fragments (existing check)
  if (containsAccountFragment(password, context)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}

/**
 * Issue #403 — Check if the password (or a close normalised variant) is in
 * the common-password list. We strip all non-alphanumeric characters and
 * compare case-insensitively so that leet-speak substitutions like `@` for
 * `a` or `0` for `o` are caught.
 */
function isCommonPassword(password: string): boolean {
  const stripped = password.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (COMMON_PASSWORDS.has(stripped)) return true;

  // Also check the raw lowercase (some users add symbols at the end)
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return true;

  return false;
}

/**
 * Issue #403 — Detect keyboard-sequential or numerical patterns of 4+ chars.
 */
function hasSequentialPattern(password: string): boolean {
  const lower = password.toLowerCase();
  for (const pattern of SEQUENTIAL_PATTERNS) {
    // Check for any 4-char substring that appears in the sequential pattern
    for (let i = 0; i <= pattern.length - 4; i++) {
      const chunk = pattern.slice(i, i + 4);
      if (lower.includes(chunk)) return true;
    }
    // Also check reversed (e.g. "gfed" from "abcdefgh")
    const reversed = pattern.split('').reverse().join('');
    for (let i = 0; i <= reversed.length - 4; i++) {
      const chunk = reversed.slice(i, i + 4);
      if (lower.includes(chunk)) return true;
    }
  }
  return false;
}

function containsAccountFragment(
  password: string,
  context: PasswordContext,
): boolean {
  const normalizedPassword = normalize(password);
  const fragments = [
    context.email?.split('@')[0],
    context.displayName,
    context.name,
    context.walletAddress?.slice(0, 6),
    context.walletAddress?.slice(-6),
  ]
    .flatMap((value) => fragmentVariants(value))
    .filter((value) => value.length >= 4);

  return fragments.some((fragment) => normalizedPassword.includes(fragment));
}

function fragmentVariants(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  const normalized = normalize(value);
  return [normalized, ...normalized.split(/[^a-z0-9]+/).filter(Boolean)];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
