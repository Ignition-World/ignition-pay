import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

// Fixed valid G address used as the base for round-trip tests.
const _baseG = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
const _iterations = 100;

/// Generates a random BigInt in [0, 2^64 - 1].
BigInt _randomUint64(Random rng) {
  // Build 64 random bits from two 32-bit values.
  final hi = BigInt.from(rng.nextInt(1 << 32));
  final lo = BigInt.from(rng.nextInt(1 << 32));
  return (hi << 32) + lo;
}

/// Returns a copy of a valid M-address with the last character changed,
/// which corrupts the CRC-16 checksum. Used to verify that tampered
/// addresses are rejected during decode.
String _tamperChecksum(String mAddress) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  final last = mAddress[mAddress.length - 1];
  final idx = alphabet.indexOf(last);
  assert(idx != -1, 'Last character of M-address must be a valid base32 char');
  final next = alphabet[(idx + 1) % alphabet.length];
  return mAddress.substring(0, mAddress.length - 1) + next;
}

void main() {
  final rng = Random(42); // seeded for reproducibility

  // Feature: muxed-decode-typed-dto, Property 1: Construction preserves field values
  // For any baseG string and BigInt id, DecodedMuxedAddress(baseG, id).baseG == baseG and .id == id
  group('Property 1: Construction preserves field values', () {
    test('field values are preserved across $_iterations random instances', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final dto = DecodedMuxedAddress(baseG: _baseG, id: id);
        expect(dto.baseG, equals(_baseG),
            reason: 'baseG mismatch at iteration $i');
        expect(dto.id, equals(id), reason: 'id mismatch at iteration $i');
      }
    });

    test('boundary values: id=0 and id=2^64-1', () {
      final minDto = DecodedMuxedAddress(baseG: _baseG, id: BigInt.zero);
      expect(minDto.id, equals(BigInt.zero));

      final maxId = BigInt.parse('18446744073709551615');
      final maxDto = DecodedMuxedAddress(baseG: _baseG, id: maxId);
      expect(maxDto.id, equals(maxId));
    });
  });

  // Feature: muxed-decode-typed-dto, Property 2: Equality and hashCode consistency
  // For any two DecodedMuxedAddress instances, == and hashCode are consistent with field equality
  group('Property 2: Equality and hashCode consistency', () {
    test('equal instances have equal hashCode across $_iterations pairs', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final a = DecodedMuxedAddress(baseG: _baseG, id: id);
        final b = DecodedMuxedAddress(baseG: _baseG, id: id);
        expect(a, equals(b), reason: 'equality failed at iteration $i');
        expect(a.hashCode, equals(b.hashCode),
            reason: 'hashCode mismatch at iteration $i');
      }
    });

    test('instances with different id are not equal', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final a = DecodedMuxedAddress(baseG: _baseG, id: id);
        final b = DecodedMuxedAddress(baseG: _baseG, id: id + BigInt.one);
        expect(a, isNot(equals(b)),
            reason: 'should not be equal at iteration $i');
      }
    });
  });

  // Feature: muxed-decode-typed-dto, Property 3: toString contains both fields
  // For any DecodedMuxedAddress, toString() contains baseG and id
  group('Property 3: toString contains both fields', () {
    test('toString contains baseG and id across $_iterations instances', () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final dto = DecodedMuxedAddress(baseG: _baseG, id: id);
        final s = dto.toString();
        expect(s, contains(_baseG),
            reason: 'toString missing baseG at iteration $i');
        expect(s, contains(id.toString()),
            reason: 'toString missing id at iteration $i');
      }
    });
  });

  // Feature: muxed-decode-typed-dto, Property 4: Round-trip encode → decode → encode
  // For any valid baseG and uint64 id, encode then decode then re-encode is identity
  group('Property 4: Round-trip encode → decode → encode', () {
    test('round-trip preserves baseG and id across $_iterations random ids',
        () {
      for (var i = 0; i < _iterations; i++) {
        final id = _randomUint64(rng);
        final mAddress = MuxedAddress.encode(baseG: _baseG, id: id);
        final decoded = MuxedAddress.decode(mAddress);
        expect(decoded.baseG, equals(_baseG),
            reason: 'baseG mismatch at iteration $i (id=$id)');
        expect(decoded.id, equals(id),
            reason: 'id mismatch at iteration $i (id=$id)');
        final reEncoded =
            MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id);
        expect(reEncoded, equals(mAddress),
            reason: 're-encode mismatch at iteration $i (id=$id)');
      }
    });

    test('boundary values: id=0, id=2^53, id=2^64-1', () {
      final boundaries = [
        BigInt.zero,
        BigInt.from(2).pow(53),
        BigInt.parse('18446744073709551615'),
      ];
      for (final id in boundaries) {
        final mAddress = MuxedAddress.encode(baseG: _baseG, id: id);
        final decoded = MuxedAddress.decode(mAddress);
        expect(decoded.baseG, equals(_baseG), reason: 'baseG mismatch id=$id');
        expect(decoded.id, equals(id), reason: 'id mismatch id=$id');
        expect(MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id),
            equals(mAddress),
            reason: 're-encode mismatch id=$id');
      }
    });

    // ── Expanded uint64 edge case IDs (matching Go roundtrip_test.go) ───────
    group('uint64 edge cases (cross-language parity)', () {
      final edgeCases = <String, BigInt>{
        'min (0)': BigInt.zero,
        'one (1)': BigInt.one,
        'max_uint32_half (2^31-1)': BigInt.from(2147483647),
        'max_uint32 (2^32-1)': BigInt.from(4294967295),
        'max_uint32_plus_one (2^32)': BigInt.from(4294967296),
        'max_int64 (2^63-1)': BigInt.parse('9223372036854775807'),
        'max_int64_plus_one (2^63)': BigInt.parse('9223372036854775808'),
        'max_uint64_minus_one': BigInt.parse('18446744073709551614'),
        'max_uint64': BigInt.parse('18446744073709551615'),
        'JS safe-int boundary (2^53-1)': BigInt.parse('9007199254740991'),
        'JS safe-int canary (2^53+1)': BigInt.parse('9007199254740993'),
      };

      for (final entry in edgeCases.entries) {
        test('round-trip $entry', () {
          final id = entry.value;
          final mAddress = MuxedAddress.encode(baseG: _baseG, id: id);
          final decoded = MuxedAddress.decode(mAddress);
          expect(decoded.baseG, equals(_baseG),
              reason: 'baseG mismatch for $entry');
          expect(decoded.id, equals(id), reason: 'id mismatch for $entry');
          final reEncoded =
              MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id);
          expect(reEncoded, equals(mAddress),
              reason: 're-encode mismatch for $entry');
        });
      }
    });
  });

  // Feature: muxed-decode-typed-dto, Property 5: Invalid input throws StellarAddressException
  // For any non-M-address string, MuxedAddress.decode throws StellarAddressException
  group('Property 5: Invalid input throws StellarAddressException', () {
    test('known invalid inputs throw StellarAddressException', () {
      final invalidInputs = [
        '',
        _baseG, // G address, not M
        'not-an-address',
        'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD6', // truncated
        'XAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI', // wrong prefix
      ];
      for (final input in invalidInputs) {
        expect(
          () => MuxedAddress.decode(input),
          throwsA(isA<StellarAddressException>()),
          reason: 'expected StellarAddressException for input: "$input"',
        );
      }
    });

    test('random garbage strings throw StellarAddressException', () {
      const chars =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (var i = 0; i < _iterations; i++) {
        final len = rng.nextInt(50) + 1;
        final s = List.generate(
            len, (_) => chars[rng.nextInt(chars.length)]).join();
        // Only test strings that don't start with M (to avoid accidental valid M addresses)
        if (s.startsWith('M')) continue;
        expect(
          () => MuxedAddress.decode(s),
          throwsA(isA<StellarAddressException>()),
          reason: 'expected StellarAddressException for random input: "$s"',
        );
      }
    });

    // ── Checksum validation ─────────────────────────────────────────────────
    group('CRC-16 checksum validation', () {
      test('tampered checksum throws StellarAddressException for id=0', () {
        final mAddress =
            MuxedAddress.encode(baseG: _baseG, id: BigInt.zero);
        final tampered = _tamperChecksum(mAddress);
        expect(tampered, isNot(equals(mAddress)),
            reason: 'tampered address should differ from original');

        expect(
          () => MuxedAddress.decode(tampered),
          throwsA(isA<StellarAddressException>()),
          reason: 'decode of tampered M address must throw',
        );
      });

      test('tampered checksum throws across $_iterations random ids', () {
        for (var i = 0; i < _iterations; i++) {
          final id = _randomUint64(rng);
          final mAddress =
              MuxedAddress.encode(baseG: _baseG, id: id);
          final tampered = _tamperChecksum(mAddress);

          expect(
            () => MuxedAddress.decode(tampered),
            throwsA(isA<StellarAddressException>()),
            reason: 'tampered checksum not rejected at iteration $i (id=$id)',
          );
        }
      });

      test('tampered checksum throws for all edge case ids', () {
        final edgeIds = [
          BigInt.zero,
          BigInt.one,
          BigInt.parse('18446744073709551615'), // max uint64
          BigInt.parse('9007199254740993'), // 2^53+1 canary
        ];
        for (final id in edgeIds) {
          final mAddress =
              MuxedAddress.encode(baseG: _baseG, id: id);
          final tampered = _tamperChecksum(mAddress);

          expect(
            () => MuxedAddress.decode(tampered),
            throwsA(isA<StellarAddressException>()),
            reason: 'tampered checksum not rejected for id=$id',
          );
        }
      });
    });
  });

  // ── Spec vector cross-validation ──────────────────────────────────────────
  group('Spec vector cross-validation', () {
    final file = File('../../spec/vectors.json');

    if (file.existsSync()) {
      final Map<String, dynamic> json =
          jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      final List<dynamic> cases = json['cases'] as List<dynamic>;

      // Collect all muxed_encode cases and verify round-trip
      final muxedEncodeCases = cases
          .where((c) =>
              (c as Map<String, dynamic>)['module'] == 'muxed_encode')
          .map((c) => c as Map<String, dynamic>)
          .toList();

      for (final caseData in muxedEncodeCases) {
        final input = caseData['input'] as Map<String, dynamic>;
        final expected = caseData['expected'] as Map<String, dynamic>;
        final baseG = input['base_g'].toString();
        final id = BigInt.parse(input['id'].toString());
        final expectedMAddress = expected['mAddress'].toString();

        test(
            'encode(${caseData['description']}) matches expected M-address', () {
          final result = MuxedAddress.encode(baseG: baseG, id: id);
          expect(result, equals(expectedMAddress));
        });

        test(
            'round-trip ${caseData['description']} (spec vector)', () {
          final decoded = MuxedAddress.decode(expectedMAddress);
          expect(decoded.baseG, equals(baseG),
              reason: 'baseG mismatch for spec vector id=$id');
          expect(decoded.id, equals(id),
              reason: 'id mismatch for spec vector id=$id');
          final reEncoded =
              MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id);
          expect(reEncoded, equals(expectedMAddress),
              reason: 're-encode mismatch for spec vector id=$id');
        });
      }

      // Collect all muxed_decode cases and verify decode
      final muxedDecodeCases = cases
          .where((c) =>
              (c as Map<String, dynamic>)['module'] == 'muxed_decode')
          .map((c) => c as Map<String, dynamic>)
          .toList();

      for (final caseData in muxedDecodeCases) {
        final input = caseData['input'] as Map<String, dynamic>;
        final expected = caseData['expected'] as Map<String, dynamic>;
        final mAddress = input['mAddress'].toString();

        if (expected.containsKey('expected_error')) {
          test(
              'decode ${caseData['description']} throws', () {
            expect(
              () => MuxedAddress.decode(mAddress),
              throwsA(isA<StellarAddressException>()),
            );
          });
        } else {
          final expectedBaseG =
              (expected['baseG'] ?? expected['base_g']).toString();
          final expectedId = BigInt.parse(expected['id'].toString());

          test(
              'decode ${caseData['description']} matches expected', () {
            final decoded = MuxedAddress.decode(mAddress);
            expect(decoded.baseG, equals(expectedBaseG));
            expect(decoded.id, equals(expectedId));
          });

          test(
              'round-trip ${caseData['description']} (decode → encode)', () {
            final decoded = MuxedAddress.decode(mAddress);
            expect(decoded.baseG, equals(expectedBaseG));
            expect(decoded.id, equals(expectedId));
            final reEncoded =
                MuxedAddress.encode(baseG: decoded.baseG, id: decoded.id);
            // Re-encoding should produce the identical M-address
            expect(reEncoded, equals(mAddress),
                reason: 're-encode mismatch for spec vector');
          });
        }
      }
    } else {
      test('spec/vectors.json found', () {
        // File not found — skip spec vector tests gracefully.
        // Fail only if running in an environment where vectors.json is expected.
      }, skip: 'spec/vectors.json not found at ../../spec/vectors.json');
    }
  });
}
