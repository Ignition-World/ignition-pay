import { Warning } from "../address/types";
import { KnownMemoType } from "./types";

export type NormalizeResult = {
  normalized: string | null;
  warnings: Warning[];
};

export type MemoValidationResult = {
  valid: boolean;
  type: string;
  normalizedValue: string | null;
  warnings: Warning[];
  error?: string;
};

export type GeneratedMemo = {
  type: KnownMemoType;
  value: string;
};

/**
 * Maximum value for a 64-bit unsigned integer (uint64).
 */
const UINT64_MAX = BigInt("18446744073709551615");

/**
 * Calculates UTF-8 byte length of a string without external dependencies.
 */
function getUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return Buffer.byteLength(str, "utf8");
}

/**
 * Normalizes a numeric string into a canonical uint64 representation.
 * Strips leading zeros and validates that the value is within uint64 boundaries.
 * 
 * @param s - The numeric string to normalize.
 * @returns Result containing the normalized string (or null if invalid) and any warnings.
 */
export function normalizeMemoTextId(s: string): NormalizeResult {
  const warnings: Warning[] = [];

  if (s.length === 0 || !/^\d+$/.test(s)) {
    return { normalized: null, warnings };
  }

  let normalized = s.replace(/^0+/, "");
  if (normalized === "") {
    normalized = "0";
  }

  if (normalized !== s) {
    warnings.push({
      code: "NON_CANONICAL_ROUTING_ID",
      severity: "warn",
      message:
        "Memo routing ID had leading zeros. Normalized to canonical decimal.",
      normalization: { original: s, normalized },
    });
  }

  try {
    const val = BigInt(normalized);
    if (val > UINT64_MAX) {
      return { normalized: null, warnings };
    }
  } catch {
    return { normalized: null, warnings };
  }

  return { normalized, warnings };
}

/**
 * Validates a MEMO_TEXT string (must be <= 28 UTF-8 bytes).
 */
export function validateMemoText(text: string): boolean {
  if (typeof text !== "string") return false;
  const len = getUtf8ByteLength(text);
  return len > 0 && len <= 28;
}

/**
 * Validates a MEMO_HASH string (must be 64-character hexadecimal representation of 32 bytes).
 */
export function validateMemoHash(hash: string): boolean {
  if (typeof hash !== "string") return false;
  return /^[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Validates a MEMO_ID string or bigint (must be a valid uint64: 0 to 18446744073709551615).
 */
export function validateMemoId(id: string | bigint): boolean {
  if (typeof id === "bigint") {
    return id >= BigInt(0) && id <= UINT64_MAX;
  }
  if (typeof id !== "string") return false;
  const norm = normalizeMemoTextId(id);
  return norm.normalized !== null;
}

/**
 * Unified validator for Stellar memos (none, id, text, hash, return).
 */
export function validateMemo(
  type: KnownMemoType | string,
  value: string | null | undefined
): MemoValidationResult {
  const warnings: Warning[] = [];

  if (type === "none") {
    return {
      valid: value === null || value === undefined || value === "",
      type: "none",
      normalizedValue: null,
      warnings,
      error: value ? "Memo value provided for memo type 'none'" : undefined,
    };
  }

  if (!value) {
    return {
      valid: false,
      type,
      normalizedValue: null,
      warnings,
      error: `Memo value is required for memo type '${type}'`,
    };
  }

  switch (type) {
    case "id": {
      const norm = normalizeMemoTextId(value);
      warnings.push(...norm.warnings);
      if (norm.normalized === null) {
        return {
          valid: false,
          type: "id",
          normalizedValue: null,
          warnings,
          error: "MEMO_ID must be a numeric integer between 0 and 18446744073709551615",
        };
      }
      return {
        valid: true,
        type: "id",
        normalizedValue: norm.normalized,
        warnings,
      };
    }

    case "text": {
      if (!validateMemoText(value)) {
        return {
          valid: false,
          type: "text",
          normalizedValue: null,
          warnings,
          error: "MEMO_TEXT must not be empty and must be at most 28 UTF-8 bytes",
        };
      }
      return {
        valid: true,
        type: "text",
        normalizedValue: value,
        warnings,
      };
    }

    case "hash":
    case "return": {
      if (!validateMemoHash(value)) {
        return {
          valid: false,
          type,
          normalizedValue: null,
          warnings,
          error: `MEMO_${type.toUpperCase()} must be a 64-character hex string (32 bytes)`,
        };
      }
      return {
        valid: true,
        type,
        normalizedValue: value.toLowerCase(),
        warnings,
      };
    }

    default:
      return {
        valid: false,
        type,
        normalizedValue: null,
        warnings,
        error: `Unrecognized memo type: '${type}'`,
      };
  }
}

/**
 * Generates a valid MEMO_TEXT value (ensures max 28 UTF-8 bytes).
 */
export function generateMemoText(text: string): string {
  if (!text || typeof text !== "string") {
    throw new Error("Input text must be a non-empty string");
  }
  let result = text;
  while (getUtf8ByteLength(result) > 28) {
    result = result.slice(0, -1);
  }
  if (!result) {
    throw new Error("Failed to generate valid MEMO_TEXT");
  }
  return result;
}

/**
 * Generates a valid MEMO_HASH 64-char lowercase hex string.
 * Accepts a 64-char hex string, a 32-byte Uint8Array, or pads/formats string.
 */
export function generateMemoHash(input: string | Uint8Array): string {
  if (input instanceof Uint8Array) {
    if (input.length !== 32) {
      throw new Error("Uint8Array input for MEMO_HASH must be exactly 32 bytes");
    }
    return Array.from(input)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    // Hex string shorter than 64 chars -> pad with leading zeros
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length <= 64) {
      return trimmed.padStart(64, "0").toLowerCase();
    }
  }

  throw new Error("Invalid input for MEMO_HASH: expected 64-char hex string or 32-byte Uint8Array");
}

/**
 * Generates a valid canonical MEMO_ID string.
 */
export function generateMemoId(id: string | bigint): string {
  if (typeof id === "bigint") {
    if (id < BigInt(0) || id > UINT64_MAX) {
      throw new Error("MEMO_ID bigint out of uint64 bounds");
    }
    return id.toString();
  }
  const norm = normalizeMemoTextId(id);
  if (!norm.normalized) {
    throw new Error("Invalid MEMO_ID: must be a valid uint64 numeric string");
  }
  return norm.normalized;
}

/**
 * Unified memo generator for Stellar transactions.
 */
export function generateMemo(
  type: KnownMemoType,
  value: string | bigint | Uint8Array
): GeneratedMemo {
  switch (type) {
    case "text":
      if (typeof value !== "string") {
        throw new Error("MEMO_TEXT requires a string value");
      }
      return { type: "text", value: generateMemoText(value) };
    case "hash":
      if (typeof value !== "string" && !(value instanceof Uint8Array)) {
        throw new Error("MEMO_HASH requires a hex string or Uint8Array value");
      }
      return { type: "hash", value: generateMemoHash(value) };
    case "id":
      if (typeof value !== "string" && typeof value !== "bigint") {
        throw new Error("MEMO_ID requires a string or bigint value");
      }
      return { type: "id", value: generateMemoId(value) };
    default:
      throw new Error(`Unsupported memo generation type: '${type}'`);
  }
}
