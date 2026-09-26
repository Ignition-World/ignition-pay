import { describe, it, expect } from "vitest";
import {
  validateMemoText,
  validateMemoHash,
  validateMemoId,
  validateMemo,
  generateMemoText,
  generateMemoHash,
  generateMemoId,
  generateMemo,
} from "../routing/memo";
import { extractRouting } from "../routing/extract";

describe("Memo Validation & Generation (core-ts)", () => {
  describe("validateMemoText", () => {
    it("should accept valid text memos <= 28 bytes", () => {
      expect(validateMemoText("hello")).toBe(true);
      expect(validateMemoText("1234567890123456789012345678")).toBe(true); // 28 chars
    });

    it("should reject empty text or text > 28 bytes", () => {
      expect(validateMemoText("")).toBe(false);
      expect(validateMemoText("12345678901234567890123456789")).toBe(false); // 29 chars
    });
  });

  describe("validateMemoHash", () => {
    it("should accept 64-char hex strings", () => {
      const validHash = "a".repeat(64);
      expect(validateMemoHash(validHash)).toBe(true);
    });

    it("should reject invalid length or non-hex strings", () => {
      expect(validateMemoHash("a".repeat(63))).toBe(false);
      expect(validateMemoHash("g".repeat(64))).toBe(false);
    });
  });

  describe("validateMemoId", () => {
    it("should accept valid uint64 IDs", () => {
      expect(validateMemoId("0")).toBe(true);
      expect(validateMemoId("123456789")).toBe(true);
      expect(validateMemoId(BigInt("18446744073709551615"))).toBe(true);
    });

    it("should reject invalid/negative or out of bounds IDs", () => {
      expect(validateMemoId("-1")).toBe(false);
      expect(validateMemoId("18446744073709551616")).toBe(false);
      expect(validateMemoId("abc")).toBe(false);
    });
  });

  describe("validateMemo", () => {
    it("should validate memo of type 'none'", () => {
      expect(validateMemo("none", null).valid).toBe(true);
      expect(validateMemo("none", "something").valid).toBe(false);
    });

    it("should validate memo of type 'id'", () => {
      expect(validateMemo("id", "00123").valid).toBe(true);
      expect(validateMemo("id", "abc").valid).toBe(false);
    });

    it("should validate memo of type 'text'", () => {
      expect(validateMemo("text", "payment-memo").valid).toBe(true);
      expect(validateMemo("text", "x".repeat(30)).valid).toBe(false);
    });

    it("should validate memo of type 'hash'", () => {
      expect(validateMemo("hash", "f".repeat(64)).valid).toBe(true);
      expect(validateMemo("hash", "invalid").valid).toBe(false);
    });
  });

  describe("generateMemoText", () => {
    it("should return valid text as is", () => {
      expect(generateMemoText("deposit-123")).toBe("deposit-123");
    });

    it("should truncate text exceeding 28 bytes", () => {
      const longText = "a".repeat(40);
      const generated = generateMemoText(longText);
      expect(generated.length).toBe(28);
    });
  });

  describe("generateMemoHash", () => {
    it("should format 64-char hex to lowercase", () => {
      const input = "A".repeat(64);
      expect(generateMemoHash(input)).toBe("a".repeat(64));
    });

    it("should generate 64-char hex from 32-byte Uint8Array", () => {
      const bytes = new Uint8Array(32).fill(255);
      expect(generateMemoHash(bytes)).toBe("f".repeat(64));
    });

    it("should pad short hex strings with zeros", () => {
      expect(generateMemoHash("abc")).toBe("0".repeat(61) + "abc");
    });
  });

  describe("generateMemoId", () => {
    it("should format string or bigint to uint64 decimal string", () => {
      expect(generateMemoId("007")).toBe("7");
      expect(generateMemoId(BigInt(100))).toBe("100");
    });
  });

  describe("generateMemo", () => {
    it("should generate unified memo object", () => {
      expect(generateMemo("text", "hello")).toEqual({ type: "text", value: "hello" });
      expect(generateMemo("hash", "1234").value).toHaveLength(64);
      expect(generateMemo("id", "0123")).toEqual({ type: "id", value: "123" });
    });
  });

  describe("extractRouting with Hash & Text Memos", () => {
    const G_ADDR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

    it("should extract routing for valid MEMO_HASH", () => {
      const hashVal = "e".repeat(64);
      const result = extractRouting({
        destination: G_ADDR,
        memoType: "hash",
        memoValue: hashVal,
        sourceAccount: null,
      });
      expect(result.routingId).toBe(hashVal);
      expect(result.routingSource).toBe("memo");
    });

    it("should extract routing for valid MEMO_TEXT", () => {
      const result = extractRouting({
        destination: G_ADDR,
        memoType: "text",
        memoValue: "usr_wallet_99",
        sourceAccount: null,
      });
      expect(result.routingId).toBe("usr_wallet_99");
      expect(result.routingSource).toBe("memo");
    });
  });
});
