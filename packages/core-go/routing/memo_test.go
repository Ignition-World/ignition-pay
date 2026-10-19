package routing

import (
	"strings"
	"testing"
)

func TestValidateMemoText(t *testing.T) {
	if !ValidateMemoText("hello") {
		t.Errorf("expected 'hello' to be valid MEMO_TEXT")
	}
	if ValidateMemoText("") {
		t.Errorf("expected empty string to be invalid MEMO_TEXT")
	}
	if ValidateMemoText(strings.Repeat("a", 29)) {
		t.Errorf("expected 29-char string to be invalid MEMO_TEXT")
	}
}

func TestValidateMemoHash(t *testing.T) {
	validHash := strings.Repeat("a", 64)
	if !ValidateMemoHash(validHash) {
		t.Errorf("expected 64-char hex string to be valid MEMO_HASH")
	}
	if ValidateMemoHash(strings.Repeat("a", 63)) {
		t.Errorf("expected 63-char string to be invalid MEMO_HASH")
	}
	if ValidateMemoHash(strings.Repeat("g", 64)) {
		t.Errorf("expected non-hex string to be invalid MEMO_HASH")
	}
}

func TestValidateMemoID(t *testing.T) {
	if !ValidateMemoID("12345") {
		t.Errorf("expected '12345' to be valid MEMO_ID")
	}
	if ValidateMemoID("abc") {
		t.Errorf("expected 'abc' to be invalid MEMO_ID")
	}
}

func TestValidateMemo(t *testing.T) {
	resNone := ValidateMemo("none", "")
	if !resNone.Valid {
		t.Errorf("expected memo 'none' with empty string to be valid")
	}

	resID := ValidateMemo("id", "007")
	if !resID.Valid || resID.NormalizedValue != "7" {
		t.Errorf("expected memo 'id' '007' to normalize to '7'")
	}

	resHash := ValidateMemo("hash", strings.Repeat("F", 64))
	if !resHash.Valid || resHash.NormalizedValue != strings.Repeat("f", 64) {
		t.Errorf("expected memo 'hash' to normalize to lowercase")
	}
}

func TestGenerateMemo(t *testing.T) {
	textMemo, err := GenerateMemo("text", "payment-note")
	if err != nil || textMemo.Value != "payment-note" {
		t.Errorf("failed to generate text memo: %v", err)
	}

	hashMemo, err := GenerateMemo("hash", strings.Repeat("a", 64))
	if err != nil || hashMemo.Value != strings.Repeat("a", 64) {
		t.Errorf("failed to generate hash memo: %v", err)
	}

	idMemo, err := GenerateMemo("id", "00123")
	if err != nil || idMemo.Value != "123" {
		t.Errorf("failed to generate id memo: %v", err)
	}
}

func TestExtractRoutingWithHashAndText(t *testing.T) {
	gAddr := "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7"
	hashVal := strings.Repeat("d", 64)

	resHash := ExtractRouting(RoutingInput{
		Destination: gAddr,
		MemoType:    "hash",
		MemoValue:   hashVal,
	})
	if resHash.RoutingID == nil || resHash.RoutingID.String() != hashVal {
		t.Errorf("expected routing ID %s, got %v", hashVal, resHash.RoutingID)
	}

	resText := ExtractRouting(RoutingInput{
		Destination: gAddr,
		MemoType:    "text",
		MemoValue:   "custom_usr_attr",
	})
	if resText.RoutingID == nil || resText.RoutingID.String() != "custom_usr_attr" {
		t.Errorf("expected routing ID 'custom_usr_attr', got %v", resText.RoutingID)
	}
}
