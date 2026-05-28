#!/usr/bin/env node
/**
 * bridge.js — Node.js subprocess bridge for stellar-address-kit.
 *
 * Reads a JSON array of address objects from stdin, runs extractRouting +
 * detect on each one via the stellar-address-kit npm package, and writes
 * a JSON array of results to stdout.
 *
 * Input  (stdin):  Array<{ destination, memo_type?, memo_value? }>
 * Output (stdout): Array<{ address_type, routing_source, memo_required, warnings, muxed_id?, error? }>
 *
 * Node.js 18+ required (native BigInt, ESM-compatible require via CJS dist).
 */

"use strict";

const { extractRouting, detect } = require("stellar-address-kit");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  let batch;
  try {
    batch = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`bridge: failed to parse stdin JSON: ${e.message}\n`);
    process.exit(1);
  }

  const results = batch.map((item) => {
    const destination = (item.destination || "").trim();

    // Detect address kind first (never throws)
    const kind = detect(destination);

    // C-addresses and invalid strings are rejected by extractRouting before
    // routing logic runs. Handle them directly so we can return structured output.
    if (kind === "C") {
      return {
        address_type:   "C",
        routing_source: "none",
        memo_required:  false,
        warnings:       "INVALID_DESTINATION",
        error:          "INVALID_DESTINATION",
      };
    }

    if (kind === "invalid") {
      return {
        address_type:   "invalid",
        routing_source: "none",
        memo_required:  false,
        warnings:       "",
        error:          "invalid",
      };
    }

    let routingResult;
    try {
      routingResult = extractRouting({
        destination,
        memoType:  item.memo_type  || "none",
        memoValue: item.memo_value || null,
        sourceAccount: null,
      });
    } catch (err) {
      return {
        address_type:   kind,
        routing_source: "none",
        memo_required:  false,
        warnings:       "",
        error:          err.message || "unknown error",
      };
    }

    // Collect warning codes as a pipe-separated string (empty string if none)
    const warningCodes = (routingResult.warnings || [])
      .map((w) => w.code)
      .join("|");

    // memo_required: true when address is a plain G-address with no routing ID
    // (exchange needs a memo to route the deposit)
    const memoRequired =
      kind === "G" &&
      routingResult.routingId === null &&
      !routingResult.destinationError;

    const out = {
      address_type:   kind,
      routing_source: routingResult.routingSource,
      memo_required:  memoRequired,
      warnings:       warningCodes,
    };

    // Attach muxed_id for M-addresses so Python can surface it
    if (kind === "M" && routingResult.routingId !== null) {
      out.muxed_id = String(routingResult.routingId);
    }

    if (routingResult.destinationError) {
      out.error = routingResult.destinationError.code;
    }

    return out;
  });

  process.stdout.write(JSON.stringify(results) + "\n");
});
