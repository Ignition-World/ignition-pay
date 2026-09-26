import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:meta/meta.dart';
import '../util/strkey.dart';
import 'crypto_utils.dart';

/// Represents an Ed25519 key pair for Stellar.
///
/// Secret key material is held in a mutable [Uint8List] so it can be
/// explicitly wiped from memory via [zeroize] once the keypair is no longer
/// needed.  Callers should call [zeroize] as soon as the keypair goes out of
/// scope (e.g., in a `try/finally` block) to reduce the window during which
/// the secret bytes may be resurrected from GC-managed heap memory.
class KeyPair {
  /// The 32-byte secret seed (raw bytes).
  ///
  /// Stored as a [Uint8List] so [zeroize] can overwrite the underlying
  /// native buffer.  Do **not** keep additional copies of this list.
  final Uint8List _secretKey;

  /// The 32-byte public key (raw bytes).
  final List<int> publicKey;

  KeyPair._({
    required Uint8List secretKey,
    required List<int> publicKey,
  })  : _secretKey = secretKey,
        publicKey = List.unmodifiable(publicKey);

  /// The 32-byte secret seed as an unmodifiable view.
  ///
  /// Access this only when strictly necessary for signing or encoding.
  List<int> get secretKey => _secretKey.asUnmodifiableView();

  /// Creates a KeyPair from a 32-byte seed.
  factory KeyPair.fromSeed(List<int> seed) {
    if (seed.length != 32) {
      throw ArgumentError('Seed must be exactly 32 bytes');
    }
    final hash = sha512.convert(seed).bytes;
    final clamped = List<int>.from(hash);
    clamped[0] &= 248;
    clamped[31] &= 127;
    clamped[31] |= 64;
    final publicKey = clamped.sublist(32);
    // Copy once into a mutable Uint8List; do not retain the original list.
    return KeyPair._(
      secretKey: Uint8List.fromList(seed),
      publicKey: publicKey,
    );
  }

  /// Creates a KeyPair from separate secret and public key bytes.
  factory KeyPair.fromKeys({
    required List<int> secretKey,
    required List<int> publicKey,
  }) {
    if (secretKey.length != 32) {
      throw ArgumentError('Secret key must be exactly 32 bytes');
    }
    if (publicKey.length != 32) {
      throw ArgumentError('Public key must be exactly 32 bytes');
    }
    return KeyPair._(
      secretKey: Uint8List.fromList(secretKey),
      publicKey: publicKey,
    );
  }

  /// Encodes the public key as a Stellar Gâ€¦ address.
  ///
  /// The Stellar StrKey encoding appends a CRC-16/XMODEM checksum stored
  /// in **little-endian** order (low byte at index 0, high byte at index 1),
  /// consistent with the upstream `core-go` and `core-ts` implementations.
  ///
  /// Encoding steps:
  ///   1. Prepend the G-address version byte `0x30`.
  ///   2. Compute CRC-16/XMODEM of the version-byte + public-key payload.
  ///   3. Append the checksum as two bytes: `[crc & 0xFF, (crc >> 8) & 0xFF]`.
  ///   4. Base32-encode the full 35-byte buffer and prepend the literal 'G'.
  String get publicKeyAddress {
    // Build the version-byte + payload as a typed buffer to avoid implicit
    // List<int> conversions that could produce extra heap copies.
    final payload = Uint8List(33);
    payload[0] = 0x30; // G-address version byte
    payload.setRange(1, 33, publicKey);

    // CRC-16/XMODEM â€“ result is appended little-endian per Stellar StrKey spec.
    final checksum = StrKeyUtil.calculateChecksum(payload);

    final finalData = Uint8List(35);
    finalData.setRange(0, 33, payload);
    finalData[33] = checksum & 0xFF;       // low byte first (little-endian)
    finalData[34] = (checksum >> 8) & 0xFF; // high byte second

    return 'G${StrKeyUtil.encodeBase32(finalData)}';
  }

  /// Overwrites the secret key bytes with zeros.
  ///
  /// Call this when the keypair is no longer needed to reduce the time window
  /// during which the secret seed is recoverable from GC heap snapshots.
  ///
  /// ```dart
  /// final keypair = KeyPair.fromSeed(seed);
  /// try {
  ///   // â€¦ use keypair â€¦
  /// } finally {
  ///   keypair.zeroize();
  /// }
  /// ```
  void zeroize() {
    _secretKey.fillRange(0, _secretKey.length, 0);
  }

  /// Signs [message] using this key pair's secret key via Ed25519.
  ///
  /// Delegates to [signEd25519] in `crypto_utils.dart`, making the keypair
  /// usable end-to-end without exposing the raw [signEd25519] helper:
  ///
  /// ```dart
  /// final sig = keypair.sign(transactionHash);
  /// print(sig.signatureHex); // hex-encoded 64-byte signature
  /// ```
  ///
  /// Returns a [SignatureResult] containing the 64-byte signature, the
  /// public key bytes, and the algorithm identifier.
  SignatureResult sign(List<int> message) {
    return signEd25519(message, this);
  }
}
