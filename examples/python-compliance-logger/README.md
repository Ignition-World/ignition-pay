# Python Compliance Logger

A CLI tool that takes a CSV of inbound Stellar transactions, analyzes each destination address using stellar-address-kit, computes a compliance risk score based on address type and routing warnings, and outputs an annotated CSV. Targets compliance and ops teams at exchanges and anchors.

## Features

- Batch CSV transaction processing with robust I/O
- Integrates `stellar-address-kit` via a Node.js WASM bridge
- Assigns compliance risk scores to transactions based on parsed address details
- Detailed reporting metrics including score breakdowns and critical flags

## Use Cases

- Operations teams auditing incoming exchange transactions for risk compliance
- Automated pipeline integration for large-scale Stellar network analysis
- Identifying potentially ambiguous routing vectors (like Muxed addresses or missing Memos) in bulk data sets

## Prerequisites

- Python 3.10+
- Node.js 18+ (for the WASM bridge)

## Quick Start

```bash
pip install -r requirements.txt
npm install
python src/main.py --input sample_input.csv
```

## Output Columns

- `address_type`: The detected type of the address (G, M, C, or invalid).
- `routing_source`: Identifies where routing info comes from (muxed, memo, none).
- `memo_required`: Boolean indicating if a separate memo is expected for the transfer.
- `warnings`: Any cautionary details related to routing or address type.
- `risk_score`: A numeric score (0-100) quantifying the compliance risk.
- `risk_label`: A text label categorized from LOW to CRITICAL based on the score.

## Risk Scoring

| Warning / Condition | Points |
| --- | --- |
| Invalid address | 100 |
| C-address (contract) base risk | 40 |
| Warning `contract-sender` | 30 |
| Warning `SMART_ACCOUNT_AMBIGUOUS_ROUTING` | 25 |
| Warning `MUXED_DESTINATION_FROM_CONTRACT` | 35 |
| Warning `memo-ignored` | 15 |
| Routing source `none` | 20 |

Multiple warnings sum individual scores, capped at 100.

## Links

- Main [stellar-address-kit repository](https://github.com/Boxkit-Labs/stellar-address-kit)
