// Example: Muxed Address Encoding and Decoding
// Demonstrates creating, decoding, and validating Muxed (M...) addresses.

import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  const baseG = 'GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU';

  // ---- Encode: Create a Muxed Address from G + ID ----
  void encodeExample() {
    final userId = BigInt.from(12345);
    final muxedAddress = MuxedAddress.encode(baseG: baseG, id: userId);
    print('Encoded Muxed: $muxedAddress');
    // => MA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCAMWBM6UZQFAIB6Q
  }

  // ---- Decode: Extract Base G and ID from a Muxed Address ----
  void decodeExample() {
    const mAddress =
        'MA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCAMWBM6UZQFAIB6Q';
    final decoded = MuxedAddress.decode(mAddress);
    print('Decoded baseG: ${decoded.baseG}');
    print('Decoded id: ${decoded.id}');
    // => DecodedMuxedAddress(baseG: GA7QYNF7SOWQ3GLR2BGMZEHXR7HGCLSQSKMFYZ8ITCOMBKS5HVJBCA...)
  }

  // ---- Large ID Values (uint64-safe with BigInt) ----
  void largeIdExample() {
    // A large ID near the uint64 max — BigInt preserves full precision
    final largeId = BigInt.parse('18446744073709551615'); // uint64 max
    final muxedAddress = MuxedAddress.encode(baseG: baseG, id: largeId);
    print('Large-ID Muxed: $muxedAddress');

    final decoded = MuxedAddress.decode(muxedAddress);
    print('Decoded large ID: ${decoded.id}'); // 18446744073709551615
    print('Round-trip correct: ${decoded.id == largeId}'); // true
  }

  // ---- Error: ID Out of Range ----
  void outOfRangeExample() {
    try {
      final tooLarge = BigInt.parse('18446744073709551616'); // > uint64 max
      MuxedAddress.encode(baseG: baseG, id: tooLarge);
    } catch (e) {
      print('Caught: $e'); // StellarAddressException: ID out of uint64 range
    }
  }

  // ---- Error: Invalid Base G ----
  void invalidBaseGExample() {
    try {
      MuxedAddress.encode(
        baseG: 'NOT-A-VALID-ADDRESS',
        id: BigInt.from(1),
      );
    } catch (e) {
      print('Caught: $e'); // StellarAddressException: Invalid base G address
    }
  }

  encodeExample();
  decodeExample();
  largeIdExample();
  outOfRangeExample();
  invalidBaseGExample();
}
