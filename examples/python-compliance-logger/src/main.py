import argparse
import sys
from csv_io import read_transactions, write_annotated

def main():
    parser = argparse.ArgumentParser(description="Python Compliance Logger for Stellar Transactions")
    parser.add_argument("--input", required=True, help="Path to input CSV file")
    parser.add_argument("--output", default="output.csv", help="Path to output annotated CSV file")
    
    args = parser.parse_args()
    
    # Read and validate transactions
    print(f"Reading transactions from {args.input}...")
    transactions = read_transactions(args.input)
    print(f"Successfully read {len(transactions)} rows.")
    
    # At this stage, no analysis is performed. 
    # Annotation columns will be injected as empty strings by write_annotated.
    
    # Write annotated output
    print(f"Writing annotated transactions to {args.output}...")
    write_annotated(args.output, transactions)
    print("Done.")

if __name__ == "__main__":
    main()
