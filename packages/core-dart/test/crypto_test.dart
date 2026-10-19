import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('KeyPair', () {
    test('creates KeyPair from 32-byte seed', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      expect(keypair.secretKey.length, equals(32));
      expect(keypair.publicKey.length, equals(32));
    });

    test('creates KeyPair from separate keys', () {
      final secret = List<int>.generate(32, (i) => i);
      final public = List<int>.generate(32, (i) => i + 1);
      final keypair = KeyPair.fromKeys(secretKey: secret, publicKey: public);
      expect(keypair.secretKey, equals(secret));
      expect(keypair.publicKey, equals(public));
    });

    test('throws on invalid seed length', () {
      expect(
        () => KeyPair.fromSeed([1, 2, 3]),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('different seeds produce different keypairs', () {
      final seed1 = List<int>.generate(32, (i) => i);
      final seed2 = List<int>.generate(32, (i) => i + 128);
      final kp1 = KeyPair.fromSeed(seed1);
      final kp2 = KeyPair.fromSeed(seed2);
      expect(kp1.publicKey, isNot(equals(kp2.publicKey)));
    });

    test('generates public key address starting with G', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      final address = keypair.publicKeyAddress;
      expect(address, startsWith('G'));
      expect(address.length, greaterThan(50));
    });

    // -----------------------------------------------------------------------
    // Issue #318 – Zeroize secret key material
    // -----------------------------------------------------------------------
    group('zeroize (#318)', () {
      test('zeroize() overwrites secret key bytes with zeros', () {
        final seed = List<int>.generate(32, (i) => i + 1); // non-zero bytes
        final keypair = KeyPair.fromSeed(seed);

        // Before zeroize the secret should match the original seed.
        expect(keypair.secretKey, equals(seed));

        keypair.zeroize();

        // After zeroize all bytes must be zero.
        expect(keypair.secretKey, everyElement(equals(0)));
      });

      test('zeroize() leaves the public key intact', () {
        final seed = List<int>.generate(32, (i) => i);
        final keypair = KeyPair.fromSeed(seed);
        final publicBefore = List<int>.from(keypair.publicKey);

        keypair.zeroize();

        expect(keypair.publicKey, equals(publicBefore));
      });

      test('secretKey is an unmodifiable view', () {
        final seed = List<int>.generate(32, (i) => i);
        final keypair = KeyPair.fromSeed(seed);
        expect(
          () => (keypair.secretKey as List<int>)[0] = 0xFF,
          throwsA(isA<UnsupportedError>()),
        );
      });
    });

    // -----------------------------------------------------------------------
    // Issue #320 – publicKeyAddress checksum endianness
    // -----------------------------------------------------------------------
    group('publicKeyAddress checksum endianness (#320)', () {
      test('generated address passes round-trip validation', () {
        final seed = List<int>.generate(32, (i) => i);
        final keypair = KeyPair.fromSeed(seed);
        final address = keypair.publicKeyAddress;

        // If the CRC is appended in the wrong byte order, validateStellar
        // will return isValid == false.
        final result = validateStellar(address);
        expect(result.isValid, isTrue,
            reason:
                'publicKeyAddress must produce a StrKey-valid G-address. '
                'Checksum must be stored little-endian (low byte first).');
      });

      test('address length is exactly 56 characters', () {
        final seed = List<int>.generate(32, (i) => i);
        final address = KeyPair.fromSeed(seed).publicKeyAddress;
        expect(address.length, equals(56));
      });

      test('several distinct seeds all produce valid addresses', () {
        for (var i = 0; i < 10; i++) {
          final seed = List<int>.generate(32, (j) => (i * 7 + j) & 0xFF);
          final address = KeyPair.fromSeed(seed).publicKeyAddress;
          expect(validateStellar(address).isValid, isTrue,
              reason: 'seed $i produced an invalid address: $address');
        }
      });
    });
  });

  group('StellarKeyDerivation', () {
    test('derives key from mnemonic', () {
      final mnemonic =
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      final keypair = StellarKeyDerivation.fromMnemonic(mnemonic);
      expect(keypair.secretKey.length, equals(32));
      expect(keypair.publicKey.length, equals(32));
    });

    test('derives key from entropy', () {
      final entropy = [1, 2, 3, 4, 5, 6, 7, 8];
      final keypair = StellarKeyDerivation.fromEntropy(entropy);
      expect(keypair.secretKey.length, equals(32));
      expect(keypair.publicKey.length, equals(32));
    });
  });

  group('hash functions', () {
    test('hashSha256 produces 32 bytes', () {
      final input = [1, 2, 3, 4, 5];
      final hash = hashSha256(input);
      expect(hash.length, equals(32));
    });

    test('hashSha512 produces 64 bytes', () {
      final input = [1, 2, 3, 4, 5];
      final hash = hashSha512(input);
      expect(hash.length, equals(64));
    });

    test('same input produces same hash', () {
      final input = [1, 2, 3];
      expect(hashSha256(input), equals(hashSha256(input)));
    });

    test('different inputs produce different hashes', () {
      expect(hashSha256([1, 2, 3]), isNot(equals(hashSha256([4, 5, 6]))));
    });
  });

  group('HMAC-SHA256', () {
    test('produces 32 bytes', () {
      final key = [1, 2, 3, 4, 5];
      final data = [6, 7, 8, 9, 10];
      final result = hmacSha256(key, data);
      expect(result.length, equals(32));
    });

    test('deterministic output', () {
      final key = [1, 2, 3];
      final data = [4, 5, 6];
      expect(hmacSha256(key, data), equals(hmacSha256(key, data)));
    });
  });

  group('Ed25519 signing and verification', () {
    test('signs and verifies message', () {
      final seed = List<int>.generate(32, (i) => i);
      final keypair = KeyPair.fromSeed(seed);
      final message = [1, 2, 3, 4, 5];

      final signature = signEd25519(message, keypair);
      expect(signature.signature.length, equals(64));
      expect(signature.publicKey, equals(keypair.publicKey));

      final verification = verifyEd25519(
        message,
        signature.signature,
        keypair.publicKey,
      );
      expect(verification.isValid, isTrue);
    });

    test('rejects wrong signature', () {
      final seed1 = List<int>.generate(32, (i) => i);
      final seed2 = List<int>.generate(32, (i) => i + 1);
      final kp1 = KeyPair.fromSeed(seed1);
      final kp2 = KeyPair.fromSeed(seed2);
      final message = [1, 2, 3];

      final signature = signEd25519(message, kp1);
      final verification = verifyEd25519(
        message,
        signature.signature,
        kp2.publicKey,
      );
      expect(verification.isValid, isFalse);
    });

    test('rejects invalid signature length', () {
      final publicKey = List<int>.generate(32, (i) => i);
      final result = verifyEd25519([1, 2, 3], [1, 2, 3], publicKey);
      expect(result.isValid, isFalse);
    });
  });

  group('Stellar seed encoding', () {
    test('encodes and decodes seeds', () {
      final seed = List<int>.generate(32, (i) => i);
      final encoded = encodeStellarSeed(seed);
      expect(encoded, startsWith('S'));

      final decoded = decodeStellarSeed(encoded);
      expect(decoded, equals(seed));
    });

    test('encoded seed has valid format', () {
      final seed = List<int>.generate(32, (i) => i);
      final encoded = encodeStellarSeed(seed);
      expect(encoded.length, greaterThan(50));
    });

    test('decodeStellarSeed rejects non-S prefix', () {
      expect(
        () => decodeStellarSeed('GABC123'),
        throwsA(isA<ArgumentError>()),
      );
    });
  });
}
