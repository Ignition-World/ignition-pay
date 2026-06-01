"""
analyzer.py — Python wrapper that calls bridge.js via a Node.js subprocess.

Batches addresses in groups of BATCH_SIZE (100) to avoid pipe-buffer limits,
then merges the results back into the original row order.
"""

import json
import subprocess
import sys
from pathlib import Path

BATCH_SIZE = 100
BRIDGE_PATH = Path(__file__).parent / "bridge.js"


def _run_bridge(batch: list[dict]) -> list[dict]:
    """Send one batch to bridge.js and return the parsed results."""
    payload = json.dumps(batch)
    try:
        proc = subprocess.run(
            ["node", str(BRIDGE_PATH)],
            input=payload,
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        sys.exit(
            "Error: 'node' not found. Node.js 18+ is required to run the bridge."
        )
    except subprocess.CalledProcessError as exc:
        sys.exit(
            f"Error: bridge.js exited with code {exc.returncode}.\n"
            f"stderr: {exc.stderr.strip()}"
        )

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        sys.exit(f"Error: could not parse bridge output as JSON: {exc}")


def analyze_batch(addresses: list[dict]) -> list[dict]:
    """
    Analyze a list of address dicts in batches of BATCH_SIZE.

    Each input dict may contain:
        destination  (str, required)
        memo_type    (str, optional)  — "none" | "id" | "text" | "hash" | "return"
        memo_value   (str, optional)

    Returns a list of result dicts (same length, same order) with keys:
        address_type    — "G" | "M" | "C" | "invalid"
        routing_source  — "muxed" | "memo" | "none"
        memo_required   — bool
        warnings        — pipe-separated warning codes, or ""
        muxed_id        — str (only present for M-addresses)
        error           — str (only present on error)
    """
    results: list[dict] = []
    for i in range(0, len(addresses), BATCH_SIZE):
        chunk = addresses[i : i + BATCH_SIZE]
        results.extend(_run_bridge(chunk))
    return results
