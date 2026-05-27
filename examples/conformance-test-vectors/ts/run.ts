/**
 * Conformance test runner for stellar-address-kit.
 *
 * Approach:
 *   Load spec/vectors.json, dispatch each case by module to the matching
 *   stellar-address-kit function, compare actual vs expected, and print a
 *   PASS / FAIL summary. Exits with code 1 if any vector fails.
 *
 * Address normalisation:
 *   vectors.json uses legacy placeholder addresses with invalid checksums.
 *   Following packages/core-ts/src/spec/runner.test.ts, we swap them for
 *   valid equivalents so the runner tests routing logic, not checksum validation.
 *
 * Modules:
 *   muxed_encode    -> encodeMuxed(baseG, BigInt(id))
 *   muxed_decode    -> decodeMuxed(mAddress)
 *   detect          -> detect(address)
 *   extract_routing -> extractRouting({ destination, memoType, memoValue })
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  detect,
  encodeMuxed,
  decodeMuxed,
  extractRouting,
  ExtractRoutingError,
} from "stellar-address-kit";
import type { Warning } from "stellar-address-kit";

// ── Load vectors ──────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorsPath = resolve(__dirname, "../../../spec/vectors.json");
const { cases } = JSON.parse(readFileSync(vectorsPath, "utf-8")) as {
  spec_version: string;
  cases: Vector[];
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Vector = {
  module: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  tags: string[];
  notes?: string;
};

// ── Address normalisation ─────────────────────────────────────────────────────
// vectors.json uses placeholder addresses with invalid checksums.
// These mirror the constants in packages/core-ts/src/spec/runner.test.ts.

const LEGACY_G = "GA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const LEGACY_M_PREFIX = "MA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const LEGACY_C_PREFIX = "CA7QYNF7SZFX4X7X5JFZZ3UQ6BXHDSY2RKVKZKX5FFQJ1ZMZX1";
const VALID_G = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI";
const VALID_C = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

function normalizeDestination(destination: string, expectedRoutingId: unknown): string {
  if (destination === LEGACY_G) return VALID_G;
  if (destination.startsWith(LEGACY_M_PREFIX)) {
    return encodeMuxed(VALID_G, BigInt(expectedRoutingId as string));
  }
  if (destination.startsWith(LEGACY_C_PREFIX)) return VALID_C;
  return destination;
}

function normalizeBaseAccount(value: unknown): unknown {
  if (value === LEGACY_G) return VALID_G;
  return value;
}

// ── Comparison helpers ────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "bigint") return a.toString() === String(b);
  if (typeof b === "bigint") return String(a) === b.toString();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join() !== kb.join()) return false;
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }
  return false;
}

function toStr(v: unknown): string {
  return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
}

type CheckResult = { ok: boolean; failures: string[] };

function checkFields(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
): CheckResult {
  const failures: string[] = [];
  for (const key of Object.keys(expected)) {
    if (!deepEqual(actual[key], expected[key])) {
      failures.push(
        `  field "${key}": expected ${toStr(expected[key])} got ${toStr(actual[key])}`
      );
    }
  }
  return { ok: failures.length === 0, failures };
}

function checkWarnings(
  actual: Warning[],
  expected: Record<string, unknown>[]
): string[] {
  if (actual.length !== expected.length) {
    return [`  warnings: expected ${expected.length}, got ${actual.length}`];
  }
  const failures: string[] = [];
  for (let i = 0; i < expected.length; i++) {
    const { failures: f } = checkFields(
      actual[i] as Record<string, unknown>,
      expected[i]
    );
    failures.push(...f.map((s) => `  warning[${i}]${s.slice(1)}`));
  }
  return failures;
}

// ── Module runners ────────────────────────────────────────────────────────────

function runMuxedEncode(v: Vector): CheckResult {
  const result = encodeMuxed(
    v.input.base_g as string,
    BigInt(v.input.id as string)
  );
  return checkFields({ mAddress: result }, v.expected);
}

function runMuxedDecode(v: Vector): CheckResult {
  if ("expected_error" in v.expected) {
    try {
      decodeMuxed(v.input.mAddress as string);
      return { ok: false, failures: ["  expected an error but none was thrown"] };
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const want = (v.expected.expected_error as string).toLowerCase();
      if (msg.includes(want)) return { ok: true, failures: [] };
      return {
        ok: false,
        failures: [`  error mismatch: expected "${want}", got "${msg}"`],
      };
    }
  }
  const { baseG, id } = decodeMuxed(v.input.mAddress as string);
  return checkFields({ base_g: baseG, baseG, id: id.toString() }, v.expected);
}

function runDetect(v: Vector): CheckResult {
  // detect() returns only the kind string. The vector may also specify
  // "address" and "warnings" (parse() fields) — we only assert "kind" here,
  // matching the behaviour of packages/core-ts/src/spec/runner.test.ts.
  const kind = detect(v.input.address as string);
  return checkFields({ kind }, { kind: v.expected.kind });
}

function runExtractRouting(v: Vector): CheckResult {
  const destination = normalizeDestination(
    v.input.destination as string,
    v.expected.routingId
  );

  const routingInput = {
    destination,
    memoType: v.input.memoType as string,
    memoValue: (v.input.memoValue as string | undefined) ?? null,
    sourceAccount: null,
  };

  // Published v1.0.1 throws ExtractRoutingError for C-addresses instead of
  // returning a warning result. Catch and report as a known spec gap.
  if (destination.startsWith("C")) {
    try {
      extractRouting(routingInput);
      return {
        ok: false,
        failures: ["  expected INVALID_DESTINATION warning but got a result"],
      };
    } catch (err) {
      if (err instanceof ExtractRoutingError) {
        return {
          ok: false,
          failures: [
            "  package throws ExtractRoutingError; spec expects INVALID_DESTINATION warning result",
          ],
        };
      }
      throw err;
    }
  }

  const result = extractRouting(routingInput);

  const expWarnings = (v.expected.warnings ?? []) as Record<string, unknown>[];
  const warnFailures = checkWarnings(result.warnings, expWarnings);

  const nonWarn = { ...v.expected };
  delete nonWarn.warnings;

  const actual: Record<string, unknown> = {
    destinationBaseAccount: normalizeBaseAccount(result.destinationBaseAccount),
    routingId: result.routingId != null ? String(result.routingId) : null,
    routingSource: result.routingSource,
  };

  // Normalize expected base account (legacy placeholder -> valid address)
  const normalizedExpected = { ...nonWarn };
  if ("destinationBaseAccount" in normalizedExpected) {
    normalizedExpected.destinationBaseAccount = normalizeBaseAccount(
      normalizedExpected.destinationBaseAccount
    );
  }

  const { failures: baseFailures } = checkFields(actual, normalizedExpected);
  const all = [...baseFailures, ...warnFailures];
  return { ok: all.length === 0, failures: all };
}

// ── Main ──────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const v of cases) {
  let result: CheckResult;

  try {
    switch (v.module) {
      case "muxed_encode":
        result = runMuxedEncode(v);
        break;
      case "muxed_decode":
        result = runMuxedDecode(v);
        break;
      case "detect":
        result = runDetect(v);
        break;
      case "extract_routing":
        result = runExtractRouting(v);
        break;
      default:
        result = { ok: false, failures: [`  unknown module: ${v.module}`] };
    }
  } catch (err) {
    result = {
      ok: false,
      failures: [
        `  unexpected throw: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  if (result.ok) {
    console.log(`PASS  [${v.module}] ${v.description}`);
    passed++;
  } else {
    console.log(`FAIL  [${v.module}] ${v.description}`);
    result.failures.forEach((f) => console.log(f));
    failed++;
  }
}

console.log(`\n${passed + failed} vectors: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
