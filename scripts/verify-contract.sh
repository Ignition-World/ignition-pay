#!/usr/bin/env bash
# verify-contract.sh - Verify contract WASM matches audited source
#
# Usage:
#   ./scripts/verify-contract.sh [expected_hash]
#
# This script:
# 1. Builds the contract in release mode
# 2. Computes the WASM SHA-256 hash
# 3. Optionally compares against an expected (audited) hash

set -euo pipefail

CONTRACT_DIR="contracts/ignition_pay_contract"
WASM_FILE="${CONTRACT_DIR}/ignition_pay_contract.wasm"
EXPECTED_HASH="${1:-}"

echo "🔨 Building contract in release mode..."
cd "${CONTRACT_DIR}"
cargo build --release --target wasm32-unknown-unknown

echo "📦 Copying WASM artifact..."
cp target/wasm32-unknown-unknown/release/ignition_pay_contract.wasm .

echo "🔐 Computing WASM SHA-256 hash..."
HASH=$(sha256sum "${WASM_FILE}" | awk '{print $1}')
echo "   WASM Hash: ${HASH}"

if [ -n "${EXPECTED_HASH}" ]; then
    echo ""
    echo "🔍 Comparing against expected hash..."
    echo "   Expected:  ${EXPECTED_HASH}"
    echo "   Actual:    ${HASH}"
    
    if [ "${EXPECTED_HASH}" = "${HASH}" ]; then
        echo ""
        echo "✅ VERIFIED: WASM matches the expected (audited) hash."
        exit 0
    else
        echo ""
        echo "❌ MISMATCH: WASM does NOT match the expected hash!"
        echo "   This means the build is not reproducible or the source has changed."
        exit 1
    fi
else
    echo ""
    echo "ℹ️  No expected hash provided. Run with:"
    echo "   ./scripts/verify-contract.sh <expected_hash>"
    echo ""
    echo "   To record the current hash for future verification:"
    echo "   echo '${HASH}' > ${CONTRACT_DIR}/EXPECTED_WASM_HASH"
    exit 0
fi
