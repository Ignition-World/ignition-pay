# stellar_address_kit

[![pub package](https://img.shields.io/pub/v/stellar_address_kit.svg)](https://pub.dev/packages/stellar_address_kit)
[![style: very good analysis](https://img.shields.io/badge/style-very_good_analysis-blue)](https://pub.dev/packages/stellar_address_kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/packages/core-dart/LICENSE)

A robust, cross-language Stellar address handling library for **Dart and Flutter** applications. Part of the [Boxkit Labs Stellar Address Kit](https://github.com/Boxkit-Labs/stellar-address-kit) suite (also available in [TypeScript](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-ts) and [Go](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-go)).

## Features

- 🔍 **Detect** G, M, and C Stellar address types
- ✅ **Validate** addresses with optional strict-casing mode
- 📦 **Parse** addresses into structured results with warnings and errors
- 🔀 **Encode & Decode** Muxed (SEP-0023) addresses with `BigInt` IDs
- 🧭 **Extract Routing** information from payment operations for pooled-account deposit reconciliation
- 🏷️ **Type-safe** enums, warning codes, and error codes across all modules

## Installation

Add `stellar_address_kit` to your `pubspec.yaml`:

```yaml
dependencies:
  stellar_address_kit: ^1.0.1
```

Then run:

```bash
dart pub get
```

## Quick Start

```dart
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  // 1. Detect and validate an address
  final address = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  final kind = detect(address);                              // AddressKind.g
  final valid = validate(address);                           // true

  // 2. Parse and inspect
  final parsed = StellarAddress.parse(address);
  print('Kind: ${parsed.kind}, Raw: ${parsed.raw}');
  print('Base G: ${parsed.baseG}, Muxed ID: ${parsed.muxedId}');

  // 3. Encode a Muxed address (SEP-0023)
  final mAddress = MuxedAddress.encode(
    baseG: address,
    id: BigInt.from(12345),
  );
  print('Muxed: $mAddress');

  // 4. Decode a Muxed address
  final decoded = MuxedAddress.decode(mAddress);
  print('Base G: ${decoded.baseG}, ID: ${decoded.id}');

  // 5. Extract routing for deposit reconciliation
  final result = extractRouting(RoutingInput(
    destination: mAddress,
    memoType: 'none',
    memoValue: null,
  ));
  print('Routing source: ${result.source}, ID: ${result.id}');
  for (final w in result.warnings) {
    print('⚠️  ${w.severity}: ${w.code}');
  }
}
```

## API Reference

### Address Detection

```dart
AddressKind? detect(String address)
```

Classifies a raw Stellar address string into `AddressKind.g`, `AddressKind.m`, or `AddressKind.c`. Returns `null` for invalid, tampered, or empty inputs.

- **Non-throwing**: never propagates internal exceptions — returns `null` instead.
- **Case-insensitive**: accepts `g…`, `G…`, `m…`, `M…`, etc.
- **Prefix first**: `UNKNOWN_PREFIX` fires before checksum verification.
- **Spec-compliant**: identical behaviour to TypeScript and Go implementations per `spec/vectors.json`.

### Address Validation

```dart
bool validate(String address, {bool strict = false})
```

Returns `true` if the address is a structurally-valid Stellar address. When `strict: true`, rejects non-canonical casing (lowercase).

### Address Parsing

```dart
ParseResult parse(String input)
```

Parses a string into a `ParseResult` containing:
- `kind` — detected `AddressKind` (or `null`)
- `address` — canonical uppercase form
- `warnings` — list of non-blocking `Warning` objects
- `error` — `AddressError` when parsing fails

### Muxed Address Encoding / Decoding

```dart
class MuxedAddress {
  static String encode({required String baseG, required BigInt id});
  static DecodedMuxedAddress decode(String mAddress);
}
```

- `encode()` creates an M-address from a G-address and a 64-bit unsigned integer ID. Throws `StellarAddressException` for invalid base G or out-of-range IDs.
- `decode()` extracts the base G-address and ID from an M-address.
- `DecodedMuxedAddress` has `baseG` (String) and `id` (BigInt) fields.

> ⚠️ **Web BigInt caveat**: Dart's `int` compiles to JavaScript `Number` on web targets, which loses precision above 2⁵³. Always use `BigInt` for 64-bit IDs, or serialize as `String` with explicit conversion.

### Routing Extraction

```dart
RoutingResult extractRouting(RoutingInput input)
```

Extracts a routing ID from a Stellar payment operation for pooled-account deposit reconciliation.

`RoutingInput`:
- `destination` — the payment destination address (G or M)
- `memoType` — `none`, `id`, `text`, `hash`, or `return`
- `memoValue` — the raw memo string
- `sourceAccount` — optional source account for contract detection

`RoutingResult`:
- `source` — `RoutingSource.muxed`, `.memo`, or `.none`
- `id` — resolved `BigInt` routing identifier
- `destinationBaseAccount` — resolved G-address for the destination
- `warnings` — list of `RoutingWarning` objects
- `destinationError` — `DestinationError` for unparseable destinations

**Routing Priority Policy:**
1. M-address embedded ID (highest priority)
2. MEMO_ID or numeric MEMO_TEXT
3. No route (`RoutingSource.none`)

**Contract Sender Policy:**
If the source account is a C-address (Soroban smart contract), the routing state is cleared to `RoutingSource.none` with a `CONTRACT_SENDER_DETECTED` warning.

### Error & Warning Codes

The library provides structured error and warning codes for programmatic handling:

**Error Codes** (`ErrorCode`):
| Code | Description |
|------|-------------|
| `UNKNOWN_PREFIX` | Address prefix is not G, M, or C |
| `INVALID_CHECKSUM` | CRC-16 checksum mismatch |
| `INVALID_LENGTH` | Decoded length does not match prefix |
| `INVALID_BASE32` | Malformed Base32 encoding |
| `REJECTED_SEED_KEY` | S… (secret key) addresses rejected |
| `REJECTED_PREAUTH` | T… (pre-auth tx) addresses rejected |
| `REJECTED_HASH_X` | X… (hash-x) addresses rejected |
| `FEDERATION_ADDRESS_NOT_SUPPORTED` | `name*domain.com` not supported |

**Warning Codes** (`WarningCode`):
| Code | Description |
|------|-------------|
| `NON_CANONICAL_ADDRESS` | Lowercase/ non-standard casing |
| `NON_CANONICAL_ROUTING_ID` | Leading zeros in routing ID |
| `MEMO_IGNORED_FOR_MUXED` | Memo present but M-address takes priority |
| `MEMO_PRESENT_WITH_MUXED` | Both M-address and memo present |
| `CONTRACT_SENDER_DETECTED` | C-address source detected |
| `MEMO_TEXT_UNROUTABLE` | Non-numeric MEMO_TEXT |
| `MEMO_ID_INVALID_FORMAT` | Malformed MEMO_ID |
| `UNSUPPORTED_MEMO_TYPE` | HASH or RETURN memos not supported |
| `INVALID_DESTINATION` | C-address destination for classic Payment |

## Architecture

```
packages/core-dart/lib/
├── stellar_address_kit.dart          # Barrel export file
└── src/
    ├── address/
    │   ├── stellar_address.dart     # StellarAddress value object
    │   ├── detect.dart              # detect() — structural classifier
    │   ├── validate.dart            # validate() — boolean checker
    │   ├── parse.dart               # parse() — structured result builder
    │   └── codes.dart               # Enums + error/warning codes
    ├── muxed/
    │   ├── encode.dart              # MuxedEncoder
    │   ├── decode.dart              # MuxedDecoder
    │   ├── decoded_muxed_address.dart  # DecodedMuxedAddress DTO
    │   └── muxed_address.dart       # MuxedAddress facade
    ├── routing/
    │   ├── extract.dart             # extractRouting() — resolver
    │   ├── routing_result.dart      # RoutingResult + RoutingInput
    │   └── memo.dart                # Memo normalizers
    ├── util/
    │   └── strkey.dart              # StrKeyUtil (Base32 + CRC-16)
    └── exceptions.dart              # StellarAddressException
```

## Design Decisions

### 1. Immutability
`StellarAddress` is `@immutable` — constructed once via a private factory and a `const` constructor. This prevents accidental mutation of parsed addresses.

### 2. Null Safety
`detect()` is **contractually non-throwing** — returns `null` instead of propagating exceptions. This eliminates try/catch boilerplate for simple classification tasks.

### 3. Canonical Casing
`parse()` **always normalizes to uppercase**. A `NON_CANONICAL_ADDRESS` warning is emitted for lowercase inputs, but the returned address is always the canonical form.

### 4. BigInt for IDs
Muxed account IDs are **always `BigInt`**, never `int` or `double`. This preserves full 64-bit precision across all platforms (including web/JS targets).

### 5. Spec Compliance
All implementations (Dart, TypeScript, Go) produce **identical results** for every vector in the shared `spec/vectors.json` test suite. The spec is the single source of truth.

### 6. Explicit Error Modelling
Errors and warnings are **modelled as typed objects** (`AddressError`, `Warning`, `RoutingWarning`, `DestinationError`, `ExtractRoutingException`), not as raw strings or free-form maps. This enables programmatic, type-safe handling.

## Platform Support

| Platform | Status |
|----------|--------|
| Android | ✅ Full support |
| iOS | ✅ Full support |
| Linux | ✅ Full support |
| macOS | ✅ Full support |
| Windows | ✅ Full support |
| Web (dart2js) | ✅ Full support (see BigInt caveat above) |
| Web (Flutter) | ✅ Full support (use `flutter_web_safe_bigint_demo` pattern) |

## Cross-Language Suite

This Dart implementation is part of a **cross-language specification suite**:

| Language | Package | Location |
|----------|---------|----------|
| Dart / Flutter | `stellar_address_kit` | `packages/core-dart/` |
| TypeScript | `@stellar-address-kit/core` | `packages/core-ts/` |
| Go | `github.com/Boxkit-Labs/stellar-address-kit/core-go` | `packages/core-go/` |

All implementations are validated against the shared specification test vectors in `spec/vectors.json` to guarantee identical behaviour.

## Guides

- [Flutter: Displaying Deposit Addresses](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/flutter-displaying-deposit-addresses.md)
- [Flutter: Web BigInt Considerations](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/flutter-web-bigint.md)
- [General: Compatibility Reference](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/compatibility-reference.md)
- [Go: Running Spec Validator](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/go-running-spec-validator.mdx)
- [TypeScript: Pooled Accounts & Muxed Deposits](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/ts-pooled-accounts.mdx)

## License

MIT — see [LICENSE](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/packages/core-dart/LICENSE) for full terms.
