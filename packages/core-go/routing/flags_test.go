package routing

import (
	"testing"

	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
)

// TestDefaultRoutingFlags verifies that DefaultRoutingFlags returns the
// expected zero-value (stable) defaults.
func TestDefaultRoutingFlags(t *testing.T) {
	flags := DefaultRoutingFlags()
	if flags.ExperimentalRouting != false {
		t.Errorf("DefaultRoutingFlags.ExperimentalRouting = %v, want false", flags.ExperimentalRouting)
	}
}

// TestResolveFlags_Nil verifies that a nil pointer returns defaults.
func TestResolveFlags_Nil(t *testing.T) {
	flags := ResolveFlags(nil)
	if flags.ExperimentalRouting != false {
		t.Errorf("ResolveFlags(nil).ExperimentalRouting = %v, want false", flags.ExperimentalRouting)
	}
}

// TestResolveFlags_ExplicitFalse verifies that an explicit false is preserved.
func TestResolveFlags_ExplicitFalse(t *testing.T) {
	f := &RoutingFlags{ExperimentalRouting: false}
	flags := ResolveFlags(f)
	if flags.ExperimentalRouting != false {
		t.Errorf("ResolveFlags(false).ExperimentalRouting = %v, want false", flags.ExperimentalRouting)
	}
}

// TestResolveFlags_ExplicitTrue verifies that an explicit true is preserved.
func TestResolveFlags_ExplicitTrue(t *testing.T) {
	f := &RoutingFlags{ExperimentalRouting: true}
	flags := ResolveFlags(f)
	if flags.ExperimentalRouting != true {
		t.Errorf("ResolveFlags(true).ExperimentalRouting = %v, want true", flags.ExperimentalRouting)
	}
}

// TestExtractRouting_FlagDispatch tests flag-controlled dispatch in ExtractRouting.
func TestExtractRouting_FlagDispatch(t *testing.T) {
	baseInput := RoutingInput{
		Destination: testBaseG,
		MemoType:    "id",
		MemoValue:   "42",
	}

	expectedResult := RoutingResult{
		DestinationBaseAccount: testBaseG,
		RoutingID:              NewRoutingID("42"),
		RoutingSource:          "memo",
		Warnings:               []address.Warning{},
	}

	t.Run("flag_omitted_uses_stable_path", func(t *testing.T) {
		result := ExtractRouting(baseInput)
		assertRoutingResult(t, result, expectedResult)
	})

	t.Run("flag_false_uses_stable_path", func(t *testing.T) {
		inp := baseInput
		inp.Flags = &RoutingFlags{ExperimentalRouting: false}
		result := ExtractRouting(inp)
		assertRoutingResult(t, result, expectedResult)
	})

	t.Run("flag_true_experimental_path_returns_same_result", func(t *testing.T) {
		// The experimental path currently delegates to stable, so the result
		// must be identical. This test will need updating once the experimental
		// model diverges from stable behaviour.
		inp := baseInput
		inp.Flags = &RoutingFlags{ExperimentalRouting: true}
		result := ExtractRouting(inp)
		assertRoutingResult(t, result, expectedResult)
	})

	t.Run("flag_true_does_not_suppress_warnings", func(t *testing.T) {
		inp := RoutingInput{
			Destination: testBaseG,
			MemoType:    "id",
			MemoValue:   "",
			Flags:       &RoutingFlags{ExperimentalRouting: true},
		}
		result := ExtractRouting(inp)
		if len(result.Warnings) == 0 {
			t.Error("expected at least one warning for invalid memo-id, got none")
		}
		if result.Warnings[0].Code != address.WarnMemoIDInvalidFormat {
			t.Errorf("Warnings[0].Code = %v, want %v", result.Warnings[0].Code, address.WarnMemoIDInvalidFormat)
		}
	})

	t.Run("flag_true_muxed_address_resolves_correctly", func(t *testing.T) {
		inp := RoutingInput{
			Destination: testMuxed,
			MemoType:    "none",
			Flags:       &RoutingFlags{ExperimentalRouting: true},
		}
		result := ExtractRouting(inp)
		if result.RoutingSource != "muxed" {
			t.Errorf("RoutingSource = %v, want muxed", result.RoutingSource)
		}
		if result.DestinationBaseAccount != testBaseG {
			t.Errorf("DestinationBaseAccount = %v, want %v", result.DestinationBaseAccount, testBaseG)
		}
	})
}
