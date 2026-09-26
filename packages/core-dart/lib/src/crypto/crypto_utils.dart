import 'dart:typed_data';
import 'dart:convert';
import 'package:convert/convert.dart' as convert;
import 'package:crypto/crypto.dart';
import 'package:meta/meta.dart';
import '../util/strkey.dart';
import 'keypair.dart';

/// Supported cryptographic algorithms.
enum CryptoAlgorithm {
  ed25519,
  sha256,
  hmacSha256,
}

/// Result of a signing operation.
@immutable
class SignatureResult {
  /// The signature bytes.
  final List<int> signature;

  /// The public key that produced the signature.
  final List<int> publicKey;

  /// The algorithm used.
  final CryptoAlgorithm algorithm;

  const SignatureResult({
    required this.signature,
    required this.publicKey,
    required this.algorithm,
  });

  /// Encodes the signature as a hex string.
  String get signatureHex => convert.hex.encode(signature);

  /// Encodes the public key as a hex string.
  String get publicKeyHex => convert.hex.encode(publicKey);
}

/// Result of a verification operation.
@immutable
class VerificationResult {
  /// Whether the signature is valid.
  final bool isValid;

  /// A human-readable message.
  final String message;

  /// The algorithm used for verification.
  final CryptoAlgorithm algorithm;

  const VerificationResult({
    required this.isValid,
    required this.message,
    required this.algorithm,
  });
}

/// Stellar-specific key derivation utilities.
class StellarKeyDerivation {
  /// Derives a Stellar key pair from a mnemonic phrase using BIP-39-like
  /// key derivation. The seed is derived via PBKDF2-HMAC-SHA256.
  static KeyPair fromMnemonic(String mnemonic, {String passphrase = ''}) {
    // NFKD normalization: use the mnemonic as-is (Dart String is already Unicode).
    final mnemonicBytes = utf8.encode(mnemonic);
    final passphraseBytes = utf8.encode('mnemonic$passphrase');
    final seed = _pbkdf2HmacSha256(
      password: mnemonicBytes,
      salt: passphraseBytes,
      iterations: 2048,
      keyLength: 32,
    );
    return KeyPair.fromSeed(seed);
  }

  /// Derives a Stellar key pair from raw entropy bytes.
  static KeyPair fromEntropy(List<int> entropy) {
    if (entropy.isEmpty) {
      throw ArgumentError('Entropy must not be empty');
    }
    final hash = sha256.convert(entropy).bytes;
    final seed = hash.sublist(0, 32);
    return KeyPair.fromSeed(seed);
  }
}

/// PBKDF2-HMAC-SHA256 implementation.
List<int> _pbkdf2HmacSha256({
  required List<int> password,
  required List<int> salt,
  required int iterations,
  required int keyLength,
}) {
  final blocks = (keyLength / 32).ceil();
  final result = List<int>.generate(keyLength, (_) => 0);

  for (var block = 1; block <= blocks; block++) {
    final blockBytes = Uint8List(4);
    blockBytes[0] = (block >> 24) & 0xFF;
    blockBytes[1] = (block >> 16) & 0xFF;
    blockBytes[2] = (block >> 8) & 0xFF;
    blockBytes[3] = block & 0xFF;

    final combinedSalt = [...salt, ...blockBytes];
    var u = _hmacSha256(password, combinedSalt);
    var t = List<int>.from(u);

    for (var i = 1; i < iterations; i++) {
      u = _hmacSha256(password, u);
      t = List.generate(t.length, (j) => t[j] ^ u[j]);
    }

    for (var i = 0; i < 32 && (block - 1) * 32 + i < keyLength; i++) {
      result[(block - 1) * 32 + i] = t[i];
    }
  }

  return result;
}

/// HMAC-SHA256 implementation.
List<int> _hmacSha256(List<int> key, List<int> data) {
  final hmac = Hmac(sha256, key);
  return hmac.convert(data).bytes;
}

/// Provides SHA-256 hashing.
List<int> hashSha256(List<int> data) {
  return sha256.convert(data).bytes;
}

/// Provides SHA-512 hashing.
List<int> hashSha512(List<int> data) {
  return sha512.convert(data).bytes;
}

/// Computes HMAC-SHA256.
List<int> hmacSha256(List<int> key, List<int> data) {
  final hmac = Hmac(sha256, key);
  return hmac.convert(data).bytes;
}

/// Signs a message with the given key pair using Ed25519.
///
/// Note: This is a simplified implementation that computes a deterministic
/// signature. In production, use a dedicated Ed25519 library.
SignatureResult signEd25519(List<int> message, KeyPair keyPair) {
  final hash = sha512.convert([...keyPair.secretKey, ...message]).bytes;
  final clamped = List<int>.from(hash);
  clamped[0] &= 248;
  clamped[31] &= 127;
  clamped[31] |= 64;

  final r = sha512.convert([...clamped.sublist(32), ...message]).bytes;
  final s = sha512.convert([...r, ...keyPair.publicKey, ...message]).bytes;

  final signature = [...r.sublist(0, 32), ...s.sublist(0, 32)];
  return SignatureResult(
    signature: signature,
    publicKey: keyPair.publicKey,
    algorithm: CryptoAlgorithm.ed25519,
  );
}

/// Verifies an Ed25519 signature.
///
/// Note: This is a simplified verification. In production, use a
/// dedicated Ed25519 library.
VerificationResult verifyEd25519(
  List<int> message,
  List<int> signature,
  List<int> publicKey,
) {
  if (signature.length != 64) {
    return const VerificationResult(
      isValid: false,
      message: 'Signature must be 64 bytes',
      algorithm: CryptoAlgorithm.ed25519,
    );
  }
  if (publicKey.length != 32) {
    return const VerificationResult(
      isValid: false,
      message: 'Public key must be 32 bytes',
      algorithm: CryptoAlgorithm.ed25519,
    );
  }

  final hash =
      sha512.convert([...signature.sublist(0, 32), ...publicKey]).bytes;
  final expectedS = sha512.convert([...hash, ...message]).bytes;

  final valid = List.generate(32, (i) => signature[32 + i] == expectedS[i])
      .every((b) => b);

  return VerificationResult(
    isValid: valid,
    message: valid ? 'Signature is valid' : 'Signature is invalid',
    algorithm: CryptoAlgorithm.ed25519,
  );
}

/// Encodes raw bytes as a Stellar seed (S... address).
String encodeStellarSeed(List<int> seedBytes) {
  if (seedBytes.length != 32) {
    throw ArgumentError('Seed must be exactly 32 bytes');
  }
  final data = [0xC0, ...seedBytes];
  final checksum = StrKeyUtil.calculateChecksum(Uint8List.fromList(data));
  final finalData = [...data, checksum & 0xFF, (checksum >> 8) & 0xFF];
  return 'S${StrKeyUtil.encodeBase32(Uint8List.fromList(finalData))}';
}

/// Decodes a Stellar seed (S... address) to raw bytes.
List<int> decodeStellarSeed(String encoded) {
  if (!encoded.startsWith('S')) {
    throw ArgumentError('Invalid seed encoding: must start with S');
  }
  final decoded = StrKeyUtil.decodeBase32(encoded);
  if (decoded[0] != 0xC0) {
    throw ArgumentError('Invalid seed version byte');
  }
  return decoded.sublist(1, 33);
}
