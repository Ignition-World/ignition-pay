"""
main.py — CLI entry point.

Usage:
    python src/main.py --input sample_input.csv --output annotated.csv

Reads a CSV that must contain at least a `destination` column.
Optional columns: `memo_type`, `memo_value`.

Writes the same CSV with four additional (or overwritten) columns:
    address_type, routing_source, memo_required, warnings
"""

import argparse
import csv
import sys
from pathlib import Path

from analyzer import analyze_batch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Annotate a CSV of Stellar addresses with routing metadata."
    )
    parser.add_argument("--input",  required=True, help="Path to input CSV file")
    parser.add_argument("--output", required=True, help="Path to output CSV file")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_path  = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        sys.exit(f"Error: input file not found: {input_path}")

    # ── Read CSV ──────────────────────────────────────────────────────────────
    with input_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            sys.exit("Error: input CSV is empty or has no header row.")
        if "destination" not in reader.fieldnames:
            sys.exit("Error: input CSV must contain a 'destination' column.")
        rows = list(reader)
        original_fields = list(reader.fieldnames)

    # ── Build address dicts for the bridge ───────────────────────────────────
    address_inputs = [
        {
            "destination": row.get("destination", ""),
            "memo_type":   row.get("memo_type",   "none") or "none",
            "memo_value":  row.get("memo_value")  or None,
        }
        for row in rows
    ]

    # ── Analyze (batched in groups of 100) ───────────────────────────────────
    print(f"Analyzing {len(rows)} address(es)…")
    analysis = analyze_batch(address_inputs)

    # ── Merge results into rows ───────────────────────────────────────────────
    annotation_fields = ["address_type", "routing_source", "memo_required", "warnings"]
    for row, result in zip(rows, analysis):
        row["address_type"]   = result.get("address_type",   "")
        row["routing_source"] = result.get("routing_source", "")
        row["memo_required"]  = str(result.get("memo_required", False)).lower()
        row["warnings"]       = result.get("warnings", "")

    # ── Write output CSV ──────────────────────────────────────────────────────
    # Preserve original column order; append annotation columns if not present.
    out_fields = list(original_fields)
    for f in annotation_fields:
        if f not in out_fields:
            out_fields.append(f)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=out_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done. Annotated CSV written to: {output_path}")


if __name__ == "__main__":
    main()
