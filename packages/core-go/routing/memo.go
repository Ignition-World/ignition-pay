package routing

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

var digitsOnly = regexp.MustCompile(`^\d+$`)
var hex64Regex = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)
var uint64Max, _ = new(big.Int).SetString("18446744073709551615", 10)

type NormalizeResult struct {
	Normalized string
	Warnings   []address.Warning
}

type MemoValidationResult struct {
	Valid           bool
	Type            string
	NormalizedValue string
	Warnings        []address.Warning
	Error           string
}

type GeneratedMemo struct {
	Type  string
	Value string
}

func NormalizeMemoTextID(s string) NormalizeResult {
	warnings := []address.Warning{}

	if s == "" || !digitsOnly.MatchString(s) {
		return NormalizeResult{Normalized: "", Warnings: warnings}
	}

	normalized := strings.TrimLeft(s, "0")
	if normalized == "" {
		normalized = "0"
	}

	if normalized != s {
		warnings = append(warnings, address.Warning{
			Code:     address.WarnNonCanonicalRoutingID,
			Severity: "warn",
			Message:  "Memo routing ID had leading zeros. Normalized to canonical decimal.",
			Normalization: &address.Normalization{
				Original:   s,
				Normalized: normalized,
			},
		})
	}

	val, ok := new(big.Int).SetString(normalized, 10)
	if !ok || val.Cmp(uint64Max) > 0 {
		return NormalizeResult{Normalized: "", Warnings: warnings}
	}

	return NormalizeResult{Normalized: normalized, Warnings: warnings}
}

// ValidateMemoText validates a MEMO_TEXT string (must be non-empty and <= 28 UTF-8 bytes).
func ValidateMemoText(text string) bool {
	length := len([]byte(text))
	return length > 0 && length <= 28
}

// ValidateMemoHash validates a MEMO_HASH string (must be 64-char hex representing 32 bytes).
func ValidateMemoHash(hash string) bool {
	return hex64Regex.MatchString(hash)
}

// ValidateMemoID validates a MEMO_ID string (must be uint64).
func ValidateMemoID(id string) bool {
	norm := NormalizeMemoTextID(id)
	return norm.Normalized != ""
}

// ValidateMemo is a unified validator for Stellar memos.
func ValidateMemo(memoType, value string) MemoValidationResult {
	warnings := []address.Warning{}

	if memoType == "none" {
		valid := value == ""
		errStr := ""
		if !valid {
			errStr = "Memo value provided for memo type 'none'"
		}
		return MemoValidationResult{
			Valid:           valid,
			Type:            "none",
			NormalizedValue: "",
			Warnings:        warnings,
			Error:           errStr,
		}
	}

	if value == "" {
		return MemoValidationResult{
			Valid:           false,
			Type:            memoType,
			NormalizedValue: "",
			Warnings:        warnings,
			Error:           fmt.Sprintf("Memo value is required for memo type '%s'", memoType),
		}
	}

	switch memoType {
	case "id":
		norm := NormalizeMemoTextID(value)
		warnings = append(warnings, norm.Warnings...)
		if norm.Normalized == "" {
			return MemoValidationResult{
				Valid:           false,
				Type:            "id",
				NormalizedValue: "",
				Warnings:        warnings,
				Error:           "MEMO_ID must be a numeric integer between 0 and 18446744073709551615",
			}
		}
		return MemoValidationResult{
			Valid:           true,
			Type:            "id",
			NormalizedValue: norm.Normalized,
			Warnings:        warnings,
		}

	case "text":
		if !ValidateMemoText(value) {
			return MemoValidationResult{
				Valid:           false,
				Type:            "text",
				NormalizedValue: "",
				Warnings:        warnings,
				Error:           "MEMO_TEXT must not be empty and must be at most 28 UTF-8 bytes",
			}
		}
		return MemoValidationResult{
			Valid:           true,
			Type:            "text",
			NormalizedValue: value,
			Warnings:        warnings,
		}

	case "hash", "return":
		if !ValidateMemoHash(value) {
			return MemoValidationResult{
				Valid:           false,
				Type:            memoType,
				NormalizedValue: "",
				Warnings:        warnings,
				Error:           fmt.Sprintf("MEMO_%s must be a 64-character hex string (32 bytes)", strings.ToUpper(memoType)),
			}
		}
		return MemoValidationResult{
			Valid:           true,
			Type:            memoType,
			NormalizedValue: strings.ToLower(value),
			Warnings:        warnings,
		}

	default:
		return MemoValidationResult{
			Valid:           false,
			Type:            memoType,
			NormalizedValue: "",
			Warnings:        warnings,
			Error:           fmt.Sprintf("Unrecognized memo type: '%s'", memoType),
		}
	}
}

// GenerateMemoText formats string to valid 28-byte MEMO_TEXT.
func GenerateMemoText(text string) (string, error) {
	if text == "" {
		return "", errors.New("input text must be a non-empty string")
	}
	bytes := []byte(text)
	if len(bytes) <= 28 {
		return text, nil
	}
	// Truncate to 28 bytes cleanly
	return string(bytes[:28]), nil
}

// GenerateMemoHash formats or pads input string to a 64-char hex string.
func GenerateMemoHash(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if hex64Regex.MatchString(trimmed) {
		return strings.ToLower(trimmed), nil
	}
	if len(trimmed) <= 64 {
		_, err := hex.DecodeString(trimmed)
		if err == nil {
			padded := fmt.Sprintf("%064s", trimmed)
			return strings.ToLower(padded), nil
		}
	}
	return "", errors.New("invalid input for MEMO_HASH: expected hex string up to 64 chars")
}

// GenerateMemoID normalizes id string into canonical uint64 decimal string.
func GenerateMemoID(id string) (string, error) {
	norm := NormalizeMemoTextID(id)
	if norm.Normalized == "" {
		return "", errors.New("invalid MEMO_ID: must be a valid uint64 numeric string")
	}
	return norm.Normalized, nil
}

// GenerateMemo produces a unified GeneratedMemo struct.
func GenerateMemo(memoType, value string) (GeneratedMemo, error) {
	switch memoType {
	case "text":
		val, err := GenerateMemoText(value)
		if err != nil {
			return GeneratedMemo{}, err
		}
		return GeneratedMemo{Type: "text", Value: val}, nil
	case "hash":
		val, err := GenerateMemoHash(value)
		if err != nil {
			return GeneratedMemo{}, err
		}
		return GeneratedMemo{Type: "hash", Value: val}, nil
	case "id":
		val, err := GenerateMemoID(value)
		if err != nil {
			return GeneratedMemo{}, err
		}
		return GeneratedMemo{Type: "id", Value: val}, nil
	default:
		return GeneratedMemo{}, fmt.Errorf("unsupported memo generation type: '%s'", memoType)
	}
}
