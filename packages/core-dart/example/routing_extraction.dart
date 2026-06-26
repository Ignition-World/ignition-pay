// Example: Routing Extraction for Pooled Account Deposits
// Demonstrates how to reconcile incoming payments using extractRouting().

import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  const baseG = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';
  final muxedAddress = MuxedAddress.encode(baseG: baseG, id: BigInt.from(42));

  // =============================================
  // 1. Muxed Routing (M-address, no memo)
  // The M-address's embedded ID takes priority.
  // =============================================
  void muxedRouting() {
    final result = extractRouting(RoutingInput(
      destination: muxedAddress,
      memoType: 'none',
      memoValue: null,
    ));
    print('Source: ${result.source}'); // RoutingSource.muxed
    print('Routing ID: ${result.id}'); // 42
    print('Base Account: ${result.destinationBaseAccount}'); // G...
    print('Warnings: ${result.warnings.isEmpty ? 'none' : result.warnings}');
  }

  // =============================================
  // 2. Memo ID Routing (G-address + MEMO_ID)
  // =============================================
  void memoIdRouting() {
    final result = extractRouting(RoutingInput(
      destination: baseG,
      memoType: 'id',
      memoValue: '99',
    ));
    print('Source: ${result.source}'); // RoutingSource.memo
    print('Routing ID: ${result.id}'); // 99
  }

  // =============================================
  // 3. Memo Text Routing (G-address + numeric MEMO_TEXT)
  // =============================================
  void memoTextRouting() {
    final result = extractRouting(RoutingInput(
      destination: baseG,
      memoType: 'text',
      memoValue: '007',
    ));
    print('Source: ${result.source}'); // RoutingSource.memo
    print('Routing ID: ${result.id}'); // 7 (leading zeros normalized)
    // Warning: NON_CANONICAL_ROUTING_ID for leading zeros
    for (final w in result.warnings) {
      print('Warning: [${w.severity}] ${w.code}: ${w.message}');
    }
  }

  // =============================================
  // 4. Muxed + Memo Conflict (memo ignored)
  // M-address ID takes priority over the memo.
  // =============================================
  void muxedWithMemo() {
    final result = extractRouting(RoutingInput(
      destination: muxedAddress,
      memoType: 'id',
      memoValue: '999',
    ));
    print('Source: ${result.source}'); // RoutingSource.muxed
    print('Routing ID: ${result.id}'); // 42 (not 999!)
    for (final w in result.warnings) {
      print('Warning: [${w.severity}] ${w.code}: ${w.message}');
    }
    // Warning: memo-ignored for muxed address
  }

  // =============================================
  // 5. Contract Sender Detection
  // =============================================
  void contractSender() {
    const contractAddress =
        'CA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBAQLCD';
    final result = extractRouting(RoutingInput(
      destination: baseG,
      memoType: 'id',
      memoValue: '55',
      sourceAccount: contractAddress,
    ));
    print('Source: ${result.source}'); // RoutingSource.none
    print('Routing ID: ${result.id}'); // null
    for (final w in result.warnings) {
      print('Warning: [${w.severity}] ${w.code}: ${w.message}');
    }
    // contract-sender: Contract source detected. Routing state cleared.
  }

  // =============================================
  // 6. Invalid Destination Handling
  // =============================================
  void invalidDestination() {
    try {
      extractRouting(RoutingInput(
        destination: 'NOTANADDRESS',
        memoType: 'id',
        memoValue: '1',
      ));
    } catch (e) {
      print('Caught: $e');
      // ExtractRoutingException: Invalid destination: expected G or M address
    }
  }

  muxedRouting();
  memoIdRouting();
  memoTextRouting();
  muxedWithMemo();
  contractSender();
  invalidDestination();
}
