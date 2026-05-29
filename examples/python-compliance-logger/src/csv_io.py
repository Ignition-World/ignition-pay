import csv
import sys
from typing import List, Dict

REQUIRED_COLUMNS = ['tx_id', 'destination_address', 'amount', 'asset', 'timestamp']
ANNOTATION_COLUMNS = ['address_type', 'routing_source', 'memo_required', 'warnings', 'risk_score']

def read_transactions(filepath: str) -> List[Dict]:
    """Reads transactions from a CSV file and validates columns."""
    rows = []
    try:
        with open(filepath, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            if not reader.fieldnames:
                print("Error: Input CSV is empty or invalid.", file=sys.stderr)
                sys.exit(1)
                
            missing_cols = [col for col in REQUIRED_COLUMNS if col not in reader.fieldnames]
            if missing_cols:
                print(f"Error: Input CSV is missing required columns: {', '.join(missing_cols)}", file=sys.stderr)
                sys.exit(1)
                
            for row in reader:
                rows.append(row)
    except FileNotFoundError:
        print(f"Error: Could not find file at '{filepath}'", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading CSV: {e}", file=sys.stderr)
        sys.exit(1)
        
    return rows

def write_annotated(filepath: str, rows: List[Dict]):
    """Writes transactions to a CSV file with annotation columns."""
    if not rows:
        print("Warning: No rows to write.", file=sys.stderr)
        return
        
    # Combine original columns with annotation columns
    # We use dict.fromkeys to preserve order and remove duplicates in case they exist
    original_keys = list(rows[0].keys())
    fieldnames = list(dict.fromkeys(original_keys + ANNOTATION_COLUMNS))
    
    try:
        with open(filepath, mode='w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            
            for row in rows:
                # Ensure all annotation columns exist with empty values if not already present
                out_row = {**row}
                for col in ANNOTATION_COLUMNS:
                    if col not in out_row:
                        out_row[col] = ""
                writer.writerow(out_row)
    except Exception as e:
        print(f"Error writing output CSV: {e}", file=sys.stderr)
        sys.exit(1)
