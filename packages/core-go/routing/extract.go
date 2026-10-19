package routing

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/muxed"
)

var digitsOnlyRegex = regexp.MustCompile(`^\d+$`)

func normalizeUnsupportedMemoType(memoType string) string {
	switch memoType {
	case "hash", "return":
		return memoType
	}

	switch strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(memoType, "_", ""), "-", "")) {
	case "memohash":
		return "hash"
	case "memoreturn":
		return "return"
	default:
		return ""
	}
}

// ExtractRouting identifies the deposit routing destination and identifier from a Stellar
// payment input. It implements the standard priority policy where M-address identifiers
// take precedence over any provided memo. Returns a RoutingResult with the decoded
// state and applicable warnings.
//
// Pass a non-nil Flags field inside input with ExperimentalRouting set to true to opt in
// to the experimental multi-chain routing path.
func ExtractRouting(input RoutingInput) RoutingResult {
	flags := ResolveFlags(input.Flags)
	if flags.ExperimentalRouting {
		return extractRoutingExperimental(input)
	}
	return extractRoutingStable(input)
}

// extractRoutingExperimental is a placeholder for the upcoming multi-chain routing model.
// It currently delegates to the stable implementation so the flag is wired up and
// testable without any behavioural change until the new model is ready.
func extractRoutingExperimental(input RoutingInput) RoutingResult {
	// TODO: replace with multi-chain resolution logic when the new routing
	// model is stabilised.
	return extractRoutingStable(input)
}

// extractRoutingStable is the current production routing path.
func extractRoutingStable(input RoutingInput) RoutingResult {
	if input.SourceAccount != "" {
		source, err := address.Parse(input.SourceAccount)
		if err == nil && source.Kind == address.KindC {
			return RoutingResult{
				RoutingSource: "none",
				Warnings: []address.Warning{{
					Code:     address.WarnContractSenderDetected,
					Severity: "info",
					Message:  "Contract source detected. Routing state cleared.",
				}},
			}
		}
	}

	parsed, err := address.Parse(input.Destination)
	if err != nil {
		addrErr, ok := err.(*address.AddressError)
		if !ok {
			addrErr = &address.AddressError{
				Code:    address.ErrUnknownPrefix,
				Input:   input.Destination,
				Message: err.Error(),
			}
		}

		return RoutingResult{
			RoutingSource: "none",
			Warnings:      []address.Warning{},
			DestinationError: &DestinationError{
				Code:    addrErr.Code,
				Message: addrErr.Message,
			},
		}
	}

	if parsed.Kind == address.KindC {
		return RoutingResult{
			RoutingSource: "none",
			Warnings: []address.Warning{{
				Code:     address.WarnInvalidDestination,
				Severity: "error",
				Message:  "C address is not a valid destination",
				Context: &address.WarningContext{
					DestinationKind: "C",
				},
			}},
		}
	}

	if parsed.Kind == address.KindM {
		baseG, id, err := muxed.DecodeMuxed(parsed.Raw)
		if err != nil {
			return RoutingResult{
				RoutingSource: "none",
				Warnings:      []address.Warning{},
				DestinationError: &DestinationError{
					Code:    address.ErrUnknownPrefix,
					Message: err.Error(),
				},
			}
		}

		warnings := append([]address.Warning{}, parsed.Warnings...)
		memoValue := stringValue(input.MemoValue)

		if input.MemoType == "id" || (input.MemoType == "text" && digitsOnlyRegex.MatchString(memoValue)) {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoPresentWithMuxed,
				Severity: "warn",
				Message:  "Routing ID found in both M-address and Memo. M-address ID takes precedence.",
			})
		} else if input.MemoType != "none" {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoIgnoredForMuxed,
				Severity: "info",
				Message:  "Memo present with M-address. Any potential routing ID in memo is ignored.",
			})
		}

		return RoutingResult{
			DestinationBaseAccount: baseG,
			RoutingID:              NewRoutingID(strconv.FormatUint(id, 10)),
			RoutingSource:          "muxed",
			Warnings:               warnings,
		}
	}

	var routingID *RoutingID
	routingSource := "none"
	warnings := append([]address.Warning{}, parsed.Warnings...)
	memoValue := stringValue(input.MemoValue)

	if input.MemoType == "id" {
		norm := NormalizeMemoTextID(memoValue)
		if norm.Normalized != "" {
			routingID = NewRoutingID(norm.Normalized)
			routingSource = "memo"
		}
		warnings = append(warnings, norm.Warnings...)

		if norm.Normalized == "" {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoIDInvalidFormat,
				Severity: "warn",
				Message:  "MEMO_ID was empty, non-numeric, or exceeded uint64 max.",
			})
		}
	} else if input.MemoType == "text" && memoValue != "" {
		norm := NormalizeMemoTextID(memoValue)
		if norm.Normalized != "" {
			routingID = NewRoutingID(norm.Normalized)
			routingSource = "memo"
			warnings = append(warnings, norm.Warnings...)
		} else if ValidateMemoText(memoValue) {
			routingID = NewRoutingID(memoValue)
			routingSource = "memo"
		} else {
			warnings = append(warnings, address.Warning{
				Code:     address.WarnMemoTextUnroutable,
				Severity: "warn",
				Message:  "MEMO_TEXT was not valid for routing (must be <= 28 UTF-8 bytes).",
			})
		}
	} else if (input.MemoType == "hash" || input.MemoType == "return") && memoValue != "" {
		if ValidateMemoHash(memoValue) {
			routingID = NewRoutingID(strings.ToLower(memoValue))
			routingSource = "memo"
		} else {
			unsupportedMemoType := normalizeUnsupportedMemoType(input.MemoType)
			warnings = append(warnings, address.Warning{
				Code:     address.WarnUnsupportedMemoType,
				Severity: "warn",
				Message:  "Memo type " + unsupportedMemoType + " is not supported for routing.",
				Context: &address.WarningContext{
					MemoType: unsupportedMemoType,
				},
			})
		}
	} else if input.MemoType != "none" {
		warnings = append(warnings, address.Warning{
			Code:     address.WarnUnsupportedMemoType,
			Severity: "warn",
			Message:  "Unrecognized memo type: " + input.MemoType,
			Context: &address.WarningContext{
				MemoType: "unknown",
			},
		})
	}

	return RoutingResult{
		DestinationBaseAccount: parsed.Raw,
		RoutingID:              routingID,
		RoutingSource:          routingSource,
		Warnings:               warnings,
	}
}

func stringValue(s string) string {
	return s
}
