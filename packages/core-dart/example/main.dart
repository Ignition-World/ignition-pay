// Comprehensive Example: Stellar Address Kit for Dart
// This example demonstrates ALL major features of the package.
//
// Run: dart example/main.dart

import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  print('╔════════════════════════════════════════╗');
  print('║   Stellar Address Kit — Dart/Flutter   ║');
  print('║   Comprehensive Feature Overview      ║');
  print('╚════════════════════════════════════════╝');
  print('');

  // ================================================================
  // SECTION 1: Address Detection
  // ================================================================
  _section1_detection();

  // ================================================================
  // SECTION 2: Address Validation
  // ================================================================
  _section2_validation();

  // ================================================================
  // SECTION 3: Address Parsing
  // ================================================================
  _section3_parsing();

  // ================================================================
  // SECTION 4: Muxed Address Operations
  // ================================================================
  _section4_muxed();

  // ================================================================
  // SECTION 5: Routing Extraction
  // ================================================================
  _section5_routing();

  // ================================================================
  // SECTION 6: Error Handling Patterns
  // ================================================================
  _section6_errors();

  print('\n✅ All examples completed successfully!\n');
}

// ---- Section 1: Detection --------------------------------------------
void _section1_detection() {
  print('─── Section 1: Address Detection ───');

  const gAddress = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  const mAddress =
      'MA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCAQV4JDPROD7DAQ';
  const cAddress =
      'CA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBAQLCD';

  print('  G → ${detect(gAddress)}'); // AddressKind.g
  print('  M → ${detect(mAddress)}'); // AddressKind.m
  print('  C → ${detect(cAddress)}'); // AddressKind.c
  print('  empty → ${detect('')}'); // null
  print('  unknown → ${detect('NOTANADDRESS')}'); // null
}

// ---- Section 2: Validation --------------------------------------------
void _section2_validation() {
  print('─── Section 2: Address Validation ───');

  const g = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  print('  validate(G)          → ${validate(g)}'); // true
  print('  validate(G, strict)  → ${validate(g, strict: true)}'); // true
  print('  validate(lower, strict) → ${validate(g.toLowerCase(), strict: true)}'); // false
  print('  validate(empty)      → ${validate('')}'); // false
}

// ---- Section 3: Parsing -----------------------------------------------
void _section3_parsing() {
  print('─── Section 3: Address Parsing ───');

  const address = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  final gResult = parse(address);
  print('  parse(G) → kind=${gResult.kind}, addr=${gResult.address}, warnings=${gResult.warnings.length}');

  final lowerResult = parse(address.toLowerCase());
  print('  parse(lower) → kind=${lowerResult.kind}, warnings=${lowerResult.warnings.length}');
  // NON_CANONICAL_ADDRESS warning emitted for lowercase input

  final invalidResult = parse('NOTANADDRESS');
  print('  parse(invalid) → kind=${invalidResult.kind}, error=${invalidResult.error?.code}');
  // UNKNOWN_PREFIX error emitted
}

// ---- Section 4: Muxed Operations -------------------------------------
void _section4_muxed() {
  print('─── Section 4: Muxed Address ───');

  void encode() {
    final baseG = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
    final id = BigInt.from(12345);
    final muxed = MuxedAddress.encode(baseG: baseG, id: id);
    print('  encode(G, 12345) → $muxed');
  }

  void decode() {
    const mAddress =
        'MA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCAMWBM6UZQFAIB6Q';
    final decoded = MuxedAddress.decode(mAddress);
    print('  decode(M...) → baseG=${decoded.baseG}, id=${decoded.id}');
  }

  void largeId() {
    final baseG = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
    final maxId = BigInt.parse('18446744073709551615'); // uint64 max
    final muxed = MuxedAddress.encode(baseG: baseG, id: maxId);
    final decoded = MuxedAddress.decode(muxed);
    print('  Large ID round-trip: ${decoded.id == maxId}'); // true
  }

  encode();
  decode();
  largeId();
}

// ---- Section 5: Routing -----------------------------------------------
void _section5_routing() {
  print('─── Section 5: Routing Extraction ───');

  final baseG = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  final muxedAddress =
      MuxedAddress.encode(baseG: baseG, id: BigInt.from(42));

  void muxedRouting() {
    final result = extractRouting(RoutingInput(
      destination: muxedAddress,
      memoType: 'none',
      memoValue: null,
    ));
    print('  Muxed route: source=${result.source}, id=${result.id}');
    // RoutingSource.muxed, id=42
  }

  void memoIdRouting() {
    final result = extractRouting(RoutingInput(
      destination: baseG,
      memoType: 'id',
      memoValue: '99',
    ));
    print('  Memo ID route: source=${result.source}, id=${result.id}');
    // RoutingSource.memo, id=99
  }

  void memoTextRouting() {
    final result = extractRouting(RoutingInput(
      destination: baseG,
      memoType: 'text',
      memoValue: '007',
    ));
    print('  Memo TEXT route: source=${result.source}, id=${result.id}');
    // RoutingSource.memo, id=7 (normalized from 007)
  }

  void muxedWithMemoConflict() {
    final result = extractRouting(RoutingInput(
      destination: muxedAddress,
      memoType: 'id',
      memoValue: '999',
    ));
    print('  Muxed + memo: source=${result.source}, id=${result.id}');
    // RoutingSource.muxed, id=42 (muxed priority over memo)
  }

  void contractSender() {
    const contractAddress =
        'CA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBAQLCD';
    final result = extractRouting(RoutingInput(
      destination: baseG,
      memoType: 'id',
      memoValue: '55',
      sourceAccount: contractAddress,
    ));
    print('  Contract sender: source=${result.source}, id=${result.id}');
    // RoutingSource.none (contract sender clears routing)
  }

  muxedRouting();
  memoIdRouting();
  memoTextRouting();
  muxedWithMemoConflict();
  contractSender();
}

// ---- Section 6: Error Patterns ---------------------------------------
void _section6_errors() {
  print('─── Section 6: Error Patterns ───');

  // StellarAddressException for invalid operations
  try {
    final baseG = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
    MuxedAddress.encode(baseG: baseG, id: BigInt.parse('18446744073709551616'));
  } catch (e) {
    print('  ID out-of-range → $e');
  }

  // ExtractRoutingException for invalid destination
  try {
    extractRouting(RoutingInput(
      destination: 'NOTANADDRESS',
      memoType: 'id',
      memoValue: '1',
    ));
  } catch (e) {
    print('  Invalid destination → $e');
  }
}
