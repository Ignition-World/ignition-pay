// src/address/errors.ts
var AddressParseError = class _AddressParseError extends Error {
  code;
  input;
  constructor(code, input, message) {
    super(message);
    this.name = "AddressParseError";
    this.code = code;
    this.input = input;
    Object.setPrototypeOf(this, _AddressParseError.prototype);
  }
};

// src/address/detect.ts
import StellarSdk from "@stellar/stellar-sdk";
var { StrKey } = StellarSdk;
var BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decodeBase32(input) {
  const s = input.toUpperCase().replace(/=+$/, "");
  const byteCount = Math.floor(s.length * 5 / 8);
  const result = new Uint8Array(byteCount);
  let buffer = 0;
  let bitsLeft = 0;
  let byteIndex = 0;
  for (const ch of s) {
    const value = BASE32_CHARS.indexOf(ch);
    if (value === -1) throw new Error(`Invalid base32 character: ${ch}`);
    buffer = buffer << 5 | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      if (byteIndex < byteCount) {
        result[byteIndex++] = buffer >> bitsLeft - 8 & 255;
      }
      bitsLeft -= 8;
      buffer &= (1 << bitsLeft) - 1;
    }
  }
  return result;
}
function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 32768) {
        crc = crc << 1 ^ 4129;
      } else {
        crc <<= 1;
      }
      crc &= 65535;
    }
  }
  return crc;
}
function detect(address) {
  if (!address) return "invalid";
  const up = address.toUpperCase();
  if (StrKey.isValidEd25519PublicKey(up)) return "G";
  if (StrKey.isValidMed25519PublicKey(up)) return "M";
  if (StrKey.isValidContract(up)) return "C";
  try {
    const prefix = up[0];
    if (prefix === "M") {
      const decoded = decodeBase32(up);
      if (decoded.length === 43 && decoded[0] === 96) {
        const data = decoded.slice(0, decoded.length - 2);
        const checksum = decoded[decoded.length - 2] | decoded[decoded.length - 1] << 8;
        if (crc16(data) === checksum) {
          return "M";
        }
      }
    }
  } catch {
  }
  return "invalid";
}

// src/address/validate.ts
function validate(address, kind) {
  const detected = detect(address);
  if (detected === "invalid") return false;
  if (kind === void 0) return true;
  return detected === kind;
}

// src/muxed/decode.ts
import { MuxedAccount } from "@stellar/stellar-sdk";
function decodeMuxed(mAddress) {
  const muxed = MuxedAccount.fromAddress(mAddress, "0");
  return {
    baseG: muxed.baseAccount().accountId(),
    id: BigInt(muxed.id())
  };
}

// src/address/parse.ts
function parse(address) {
  const up = address.toUpperCase();
  const kind = detect(up);
  if (kind === "invalid") {
    const first = up[0];
    if (first === "G" || first === "M" || first === "C") {
      throw new AddressParseError(
        "INVALID_CHECKSUM",
        address,
        "Invalid address checksum"
      );
    }
    throw new AddressParseError("UNKNOWN_PREFIX", address, "Invalid address");
  }
  switch (kind) {
    case "G":
      return { kind: "G", address: up, warnings: [] };
    case "C":
      return { kind: "C", address: up, warnings: [] };
    case "M": {
      try {
        const decoded = decodeMuxed(up);
        return {
          kind: "M",
          address: up,
          baseG: decoded.baseG,
          muxedId: decoded.id,
          warnings: []
        };
      } catch (error) {
        if (error instanceof AddressParseError) {
          throw error;
        }
        throw new AddressParseError(
          "INVALID_CHECKSUM",
          address,
          "Invalid muxed address"
        );
      }
    }
  }
}

// src/muxed/encode.ts
import { StrKey as StrKey2 } from "@stellar/stellar-sdk";
var MAX_UINT64 = 18446744073709551615n;
function encodeMuxed(baseG, id) {
  if (typeof id !== "bigint") {
    throw new TypeError(`ID must be a bigint, received ${typeof id}`);
  }
  if (id < 0n || id > MAX_UINT64) {
    throw new RangeError(`ID is outside the uint64 range: 0 to ${MAX_UINT64}`);
  }
  if (!StrKey2.isValidEd25519PublicKey(baseG)) {
    throw new Error(`Invalid base G address (Ed25519 public key expected)`);
  }
  const pubkeyBytes = Buffer.from(StrKey2.decodeEd25519PublicKey(baseG));
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64BE(id);
  return StrKey2.encodeMed25519PublicKey(Buffer.concat([pubkeyBytes, idBytes]));
}

// src/routing/memo.ts
var UINT64_MAX = BigInt("18446744073709551615");
function getUtf8ByteLength(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  return Buffer.byteLength(str, "utf8");
}
function normalizeMemoTextId(s) {
  const warnings = [];
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
      message: "Memo routing ID had leading zeros. Normalized to canonical decimal.",
      normalization: { original: s, normalized }
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
function validateMemoText(text) {
  if (typeof text !== "string") return false;
  const len = getUtf8ByteLength(text);
  return len > 0 && len <= 28;
}
function validateMemoHash(hash) {
  if (typeof hash !== "string") return false;
  return /^[0-9a-fA-F]{64}$/.test(hash);
}
function validateMemoId(id) {
  if (typeof id === "bigint") {
    return id >= BigInt(0) && id <= UINT64_MAX;
  }
  if (typeof id !== "string") return false;
  const norm = normalizeMemoTextId(id);
  return norm.normalized !== null;
}
function validateMemo(type, value) {
  const warnings = [];
  if (type === "none") {
    return {
      valid: value === null || value === void 0 || value === "",
      type: "none",
      normalizedValue: null,
      warnings,
      error: value ? "Memo value provided for memo type 'none'" : void 0
    };
  }
  if (!value) {
    return {
      valid: false,
      type,
      normalizedValue: null,
      warnings,
      error: `Memo value is required for memo type '${type}'`
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
          error: "MEMO_ID must be a numeric integer between 0 and 18446744073709551615"
        };
      }
      return {
        valid: true,
        type: "id",
        normalizedValue: norm.normalized,
        warnings
      };
    }
    case "text": {
      if (!validateMemoText(value)) {
        return {
          valid: false,
          type: "text",
          normalizedValue: null,
          warnings,
          error: "MEMO_TEXT must not be empty and must be at most 28 UTF-8 bytes"
        };
      }
      return {
        valid: true,
        type: "text",
        normalizedValue: value,
        warnings
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
          error: `MEMO_${type.toUpperCase()} must be a 64-character hex string (32 bytes)`
        };
      }
      return {
        valid: true,
        type,
        normalizedValue: value.toLowerCase(),
        warnings
      };
    }
    default:
      return {
        valid: false,
        type,
        normalizedValue: null,
        warnings,
        error: `Unrecognized memo type: '${type}'`
      };
  }
}
function generateMemoText(text) {
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
function generateMemoHash(input) {
  if (input instanceof Uint8Array) {
    if (input.length !== 32) {
      throw new Error("Uint8Array input for MEMO_HASH must be exactly 32 bytes");
    }
    return Array.from(input).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length <= 64) {
      return trimmed.padStart(64, "0").toLowerCase();
    }
  }
  throw new Error("Invalid input for MEMO_HASH: expected 64-char hex string or 32-byte Uint8Array");
}
function generateMemoId(id) {
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
function generateMemo(type, value) {
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

// src/routing/flags.ts
var DEFAULT_ROUTING_FLAGS = {
  experimentalRouting: false
};
function resolveFlags(flags) {
  return { ...DEFAULT_ROUTING_FLAGS, ...flags };
}

// src/routing/extract.ts
var ExtractRoutingError = class _ExtractRoutingError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractRoutingError";
    Object.setPrototypeOf(this, _ExtractRoutingError.prototype);
  }
};
function assertRoutableAddress(destination) {
  if (!destination || typeof destination !== "string") {
    throw new ExtractRoutingError(
      "Invalid input: destination must be a non-empty string."
    );
  }
  const prefix = destination.trim()[0]?.toUpperCase();
  if (prefix !== "G" && prefix !== "M") {
    throw new ExtractRoutingError(
      `Invalid destination: expected a G or M address, got "${destination}".`
    );
  }
}
function extractRoutingExperimental(input) {
  return extractRoutingStable(input);
}
function extractRoutingStable(input) {
  let parsed;
  try {
    parsed = parse(input.destination);
  } catch (error) {
    if (error instanceof AddressParseError) {
      return {
        destinationBaseAccount: null,
        routingId: null,
        routingSource: "none",
        warnings: [],
        destinationError: {
          code: error.code,
          message: error.message
        }
      };
    }
    throw error;
  }
  if (parsed.kind === "invalid") {
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: []
    };
  }
  if (parsed.kind === "C") {
    const warnings2 = [...parsed.warnings];
    warnings2.push({
      code: "INVALID_DESTINATION",
      severity: "error",
      message: "C address is not a valid destination",
      context: {
        destinationKind: "C"
      }
    });
    return {
      destinationBaseAccount: null,
      routingId: null,
      routingSource: "none",
      warnings: warnings2
    };
  }
  if (parsed.kind === "M") {
    const warnings2 = [...parsed.warnings];
    if (input.memoType === "id" || input.memoType === "text" && /^\d+$/.test(input.memoValue ?? "")) {
      warnings2.push({
        code: "MEMO_PRESENT_WITH_MUXED",
        severity: "warn",
        message: "Routing ID found in both M-address and Memo. M-address ID takes precedence."
      });
    } else if (input.memoType !== "none") {
      warnings2.push({
        code: "MEMO_IGNORED_FOR_MUXED",
        severity: "info",
        message: "Memo present with M-address. Any potential routing ID in memo is ignored."
      });
    }
    return {
      destinationBaseAccount: parsed.baseG,
      routingId: parsed.muxedId,
      routingSource: "muxed",
      warnings: warnings2
    };
  }
  let routingId = null;
  let routingSource = "none";
  const warnings = [...parsed.warnings];
  if (input.memoType === "id") {
    const rawValue = input.memoValue ?? "";
    const norm = normalizeMemoTextId(rawValue);
    if (norm.normalized) {
      const parsedMemoId = BigInt(norm.normalized);
      routingId = parsedMemoId.toString();
      routingSource = "memo";
      warnings.push(...norm.warnings);
    } else {
      routingSource = "none";
      warnings.push(...norm.warnings);
      warnings.push({
        code: "MEMO_ID_INVALID_FORMAT",
        severity: "warn",
        message: "MEMO_ID was empty, non-numeric, or exceeded uint64 max."
      });
    }
  } else if (input.memoType === "text" && input.memoValue) {
    const norm = normalizeMemoTextId(input.memoValue);
    if (norm.normalized) {
      routingId = norm.normalized;
      routingSource = "memo";
      warnings.push(...norm.warnings);
    } else if (validateMemoText(input.memoValue)) {
      routingId = input.memoValue;
      routingSource = "memo";
    } else {
      warnings.push({
        code: "MEMO_TEXT_UNROUTABLE",
        severity: "warn",
        message: "MEMO_TEXT was not valid for routing (must be <= 28 UTF-8 bytes)."
      });
    }
  } else if ((input.memoType === "hash" || input.memoType === "return") && input.memoValue) {
    if (validateMemoHash(input.memoValue)) {
      routingId = input.memoValue.toLowerCase();
      routingSource = "memo";
    } else {
      warnings.push({
        code: "MEMO_TEXT_UNROUTABLE",
        severity: "warn",
        message: `MEMO_${input.memoType.toUpperCase()} was not a valid 32-byte hex hash.`
      });
    }
  } else if (input.memoType !== "none") {
    warnings.push({
      code: "MEMO_TEXT_UNROUTABLE",
      severity: "warn",
      message: `Unrecognized memo type: ${input.memoType}`
    });
  }
  return {
    destinationBaseAccount: parsed.address,
    routingId,
    routingSource,
    warnings
  };
}
function extractRouting(input) {
  assertRoutableAddress(input.destination);
  const flags = resolveFlags(input.flags);
  if (flags.experimentalRouting) {
    return extractRoutingExperimental(input);
  }
  return extractRoutingStable(input);
}

// src/routing/extractFromTx.ts
import StellarSdk2 from "@stellar/stellar-sdk";
var { Transaction } = StellarSdk2;
function extractRoutingFromTx(tx, flags) {
  const op = tx.operations[0];
  if (!op || op.type !== "payment") return null;
  return extractRouting({
    destination: op.destination,
    memoType: tx.memo.type,
    memoValue: tx.memo.value?.toString() ?? null,
    sourceAccount: tx.source ?? null,
    flags
  });
}

// src/routing/types.ts
function routingIdAsBigInt(routingId) {
  if (routingId === null) {
    return null;
  }
  return typeof routingId === "bigint" ? routingId : BigInt(routingId);
}
export {
  AddressParseError,
  DEFAULT_ROUTING_FLAGS,
  ExtractRoutingError,
  decodeMuxed,
  detect,
  encodeMuxed,
  extractRouting,
  extractRoutingFromTx,
  generateMemo,
  generateMemoHash,
  generateMemoId,
  generateMemoText,
  normalizeMemoTextId,
  parse,
  resolveFlags,
  routingIdAsBigInt,
  validate,
  validateMemo,
  validateMemoHash,
  validateMemoId,
  validateMemoText
};
