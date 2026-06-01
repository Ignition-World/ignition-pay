import argparse
import csv
import json
import sys
from typing import Any, Dict, Iterable, List, Optional

WARNING_SCORES = {
    "contract_sender": 30,
    "smart_account_ambiguous_routing": 25,
    "muxed_destination_from_contract": 35,
    "memo_ignored": 15,
    "memo_ignored_for_muxed": 15,
}

INVALID_CODES = {"invalid_destination"}

ROUTING_NONE_VALUES = {"none", "", "null", "nil", "no", "not present", "undefined"}

LABELS = [
    (0, "low"),
    (30, "moderate"),
    (60, "high"),
    (100, "critical"),
]


def parse_warning_values(value: Optional[str]) -> List[str]:
    if not value or not value.strip():
        return []

    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item is not None]
        except json.JSONDecodeError:
            pass

    separators = ["|", ";", ","]
    for sep in separators:
        if sep in value:
            return [token.strip() for token in value.split(sep) if token.strip()]
    return [value]


def normalize_warning_code(code: str) -> str:
    return code.strip().lower().replace("-", "_").replace(" ", "_")


def is_invalid_address(row: Dict[str, Any]) -> bool:
    for key in ["is_valid", "valid", "destination_valid", "address_valid", "valid_address", "is_invalid", "invalid"]:
        if key in row:
            val = str(row[key]).strip().lower()
            if key in {"is_invalid", "invalid"}:
                if val in {"true", "1", "yes", "y"}:
                    return True
            else:
                if val in {"false", "0", "no", "n"}:
                    return True
    for key in ["destination_error", "destinationError", "error"]:
        if key in row and row[key] not in (None, "", "[]", "{}"):  # non-empty error indicates invalid destination
            return True
    warnings = parse_warning_values(row.get("warnings") or row.get("warning_codes") or row.get("warning_code") or row.get("warning"))
    for warning in warnings:
        if normalize_warning_code(warning) in INVALID_CODES:
            return True
    return False


def has_contract_address(row: Dict[str, Any]) -> bool:
    if str(row.get("is_contract", "")).strip().lower() in {"true", "1", "yes", "y"}:
        return True
    address = str(row.get("address", "")).strip()
    return address.upper().startswith("C")


def has_routing_source_none(row: Dict[str, Any]) -> bool:
    for key in ["routing_source", "source", "routingSource"]:
        if key in row:
            value = str(row[key]).strip().lower()
            return value in ROUTING_NONE_VALUES
    return True


def score_warnings(warnings: Iterable[str]) -> int:
    total = 0
    for warning in warnings:
        code = normalize_warning_code(warning)
        if code in WARNING_SCORES:
            total += WARNING_SCORES[code]
    return total


def score_row(row: Dict[str, Any]) -> Dict[str, Any]:
    invalid = is_invalid_address(row)
    if invalid:
        score = 100
    else:
        score = 0
        if has_contract_address(row):
            score += 40
        warnings = parse_warning_values(row.get("warnings") or row.get("warning_codes") or row.get("warning_code") or row.get("warning"))
        score += score_warnings(warnings)
        if has_routing_source_none(row):
            score += 20
        score = min(score, 100)

    label = next(label for threshold, label in LABELS if score <= threshold)
    row["risk_score"] = str(score)
    row["risk_label"] = label
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute compliance risk scores from address analysis CSV input.")
    parser.add_argument("input_csv", help="Input CSV file containing address analysis results.")
    parser.add_argument("output_csv", nargs="?", default=None, help="Optional output CSV path. Defaults to stdout.")
    args = parser.parse_args()

    with open(args.input_csv, newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        fieldnames = list(reader.fieldnames or [])
        if "risk_score" not in fieldnames:
            fieldnames.append("risk_score")
        if "risk_label" not in fieldnames:
            fieldnames.append("risk_label")

        target = open(args.output_csv, "w", newline="", encoding="utf-8") if args.output_csv else sys.stdout
        writer = csv.DictWriter(target, fieldnames=fieldnames)
        writer.writeheader()

        row_count = 0
        low = moderate = high = critical = 0
        total = 0

        for row in reader:
            total += 1
            scored_row = score_row(row)
            label = scored_row["risk_label"]
            if label == "low":
                low += 1
            elif label == "moderate":
                moderate += 1
            elif label == "high":
                high += 1
            elif label == "critical":
                critical += 1
            writer.writerow(scored_row)
            row_count += 1

        if args.output_csv:
            target.close()

    summary = (
        f"Processed {row_count} rows: low={low}, moderate={moderate}, high={high}, critical={critical}\n"
    )
    sys.stderr.write(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
