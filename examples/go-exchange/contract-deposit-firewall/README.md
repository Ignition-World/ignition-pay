# Contract Deposit Firewall

This example demonstrates security-oriented deposit filtering using stellar-address-kit's C-address warnings. It maps routing warnings and address types to specific deposit decisions: auto-credit for standard G-addresses, manual review for potential misrouting, or quarantine for contract-based deposits.

## Features
- Automated security filtering based on `stellar-address-kit` warnings
- Decision engine mapping warnings to actions (auto-credit, manual-review, quarantine)
- Protection against invalid checksums and contract-sender spoofing

## Use Cases
- Exchange backends needing strict compliance rules for inbound deposits
- Implementing automated triage for suspicious or non-standard Stellar transactions

## Quick Start

go run ./cmd/main.go

## Warning to Decision Mapping

Warning Name      -> Decision
----------------------------
contract-sender   -> quarantine
memo-ignored      -> manual-review
muxed-account     -> auto-credit
invalid-checksum  -> quarantine

[Back to stellar-address-kit](https://github.com/Boxkit-Labs/stellar-address-kit)
