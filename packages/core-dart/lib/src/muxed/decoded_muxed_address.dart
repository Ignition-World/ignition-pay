import 'dart:typed_data';

import '../util/strkey.dart';
import 'encode.dart';

class DecodedMuxedAddress {
  final String baseG;
  final BigInt id;

  const DecodedMuxedAddress({required this.baseG, required this.id});

  /// The full M-address string re-encoded from the decoded parts.
  ///
  /// Consumers can use this getter instead of manually writing
  /// `MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id)`.
  String get muxedAddressString {
    final rawBytes = _decodeBaseG(baseG);
    return MuxedEncoder.encodeMuxed(rawBytes, id);
  }

  /// Whether this decoded address represents a base account (id == 0).
  ///
  /// When `true`, the muxed address is functionally equivalent to the
  /// underlying G-address with no multiplexed sub-account.
  bool get isBaseAccount => id == BigInt.zero;

  /// Duplicates `MuxedAddress._decodeG` to avoid a circular dependency
  /// (`muxed_address.dart` imports this file). Both implementations are
  /// identical: Base32 decode the G-address and strip the version + checksum.
  static Uint8List _decodeBaseG(String g) {
    final decoded = StrKeyUtil.decodeBase32(g);
    // decoded length: 1 version byte + 32 ed25519 bytes + 2 checksum bytes = 35
    return decoded.sublist(1, 33);
  }

  Map<String, dynamic> toJson() => {
        'baseG': baseG,
        'id': id.toString(),
      };

  factory DecodedMuxedAddress.fromJson(Map<String, dynamic> json) {
    return DecodedMuxedAddress(
      baseG: json['baseG'] as String,
      id: BigInt.parse(json['id'] as String),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is DecodedMuxedAddress && other.baseG == baseG && other.id == id;

  @override
  int get hashCode => Object.hash(baseG, id);

  @override
  String toString() => 'DecodedMuxedAddress(baseG: $baseG, id: $id)';
}
