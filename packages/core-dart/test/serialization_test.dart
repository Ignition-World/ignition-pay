import 'dart:convert';
import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('StellarAddress serialization', () {
    test('round-trip G address', () {
      const addr = 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
      final parsed = StellarAddress.parse(addr);
      final json = parsed.toJson();
      expect(json['kind'], 'g');
      expect(json['raw'], addr);
      expect(json['baseG'], addr);
      expect(json.containsKey('muxedId'), false);
      final restored = StellarAddress.fromJson(json);
      expect(restored, parsed);
    });

    test('round-trip M address', () {
      const mAddr =
          'MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672';
      final parsed = StellarAddress.parse(mAddr);
      final json = parsed.toJson();
      expect(json['kind'], 'm');
      expect(json['raw'], mAddr);
      expect(json['baseG'],
          'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI');
      expect(json['muxedId'], '0');
      final restored = StellarAddress.fromJson(json);
      expect(restored, parsed);
    });

    test('round-trip C address', () {
      const cAddr = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      final parsed = StellarAddress.parse(cAddr);
      final json = parsed.toJson();
      expect(json['kind'], 'c');
      expect(json['raw'], cAddr);
      expect(json.containsKey('baseG'), false);
      expect(json.containsKey('muxedId'), false);
      final restored = StellarAddress.fromJson(json);
      expect(restored, parsed);
    });
  });

  group('DecodedMuxedAddress serialization', () {
    test('round-trip with BigInt id', () {
      final dto = DecodedMuxedAddress(
        baseG: 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI',
        id: BigInt.parse('9007199254740993'),
      );
      final json = dto.toJson();
      expect(json['baseG'], dto.baseG);
      expect(json['id'], '9007199254740993');
      final restored = DecodedMuxedAddress.fromJson(json);
      expect(restored, dto);
    });

    test('with id=0', () {
      final dto = DecodedMuxedAddress(
        baseG: 'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI',
        id: BigInt.zero,
      );
      final json = dto.toJson();
      expect(json['id'], '0');
      final restored = DecodedMuxedAddress.fromJson(json);
      expect(restored, dto);
    });
  });

  group('RoutingResult serialization', () {
    test('muxed source round-trip', () {
      final result = RoutingResult(
        source: RoutingSource.muxed,
        id: BigInt.from(42),
        warnings: [],
        destinationBaseAccount: 'GABC123',
      );
      final json = result.toJson();
      expect(json['source'], 'muxed');
      expect(json['id'], '42');
      expect(json['destinationBaseAccount'], 'GABC123');
      expect(json['warnings'], isEmpty);

      final restored = RoutingResult.fromJson(json);
      expect(restored.source, result.source);
      expect(restored.id, result.id);
      expect(restored.destinationBaseAccount, result.destinationBaseAccount);
    });

    test('memo source round-trip with warnings and memo fields', () {
      final result = RoutingResult(
        source: RoutingSource.memo,
        id: BigInt.from(100),
        memoType: 'id',
        memoValue: '100',
        warnings: [
          const RoutingWarning(
              code: 'test', severity: 'warn', message: 'Test warning'),
        ],
      );
      final json = result.toJson();
      expect(json['source'], 'memo');
      expect(json['id'], '100');
      expect(json['memoType'], 'id');
      expect(json['memoValue'], '100');
      expect(json['warnings'], hasLength(1));
      expect(json['warnings'][0]['code'], 'test');

      final restored = RoutingResult.fromJson(json);
      expect(restored.source, result.source);
      expect(restored.id, result.id);
      expect(restored.memoType, result.memoType);
      expect(restored.memoValue, result.memoValue);
      expect(restored.warnings, hasLength(1));
      expect(restored.warnings.first.code, 'test');
    });

    test('none source without id', () {
      final result = RoutingResult(source: RoutingSource.none);
      final json = result.toJson();
      expect(json['source'], 'none');
      expect(json.containsKey('id'), false);
      expect(json['warnings'], isEmpty);

      final restored = RoutingResult.fromJson(json);
      expect(restored.source, RoutingSource.none);
      expect(restored.id, isNull);
    });

    test('with destination error', () {
      final result = RoutingResult(
        source: RoutingSource.none,
        destinationError: DestinationError(
          code: 'INVALID_DESTINATION',
          message: 'Not a valid destination',
        ),
      );
      final json = result.toJson();
      expect(json['destinationError']['code'], 'INVALID_DESTINATION');

      final restored = RoutingResult.fromJson(json);
      expect(restored.destinationError?.code, 'INVALID_DESTINATION');
      expect(restored.destinationError?.message, 'Not a valid destination');
    });
  });

  group('RoutingInput serialization', () {
    test('round-trip with all fields', () {
      final input = RoutingInput(
        destination: 'GABC123',
        memoType: 'id',
        memoValue: '42',
        sourceAccount: 'GDEF456',
      );
      final json = input.toJson();
      expect(json['destination'], 'GABC123');
      expect(json['memoType'], 'id');
      expect(json['memoValue'], '42');
      expect(json['sourceAccount'], 'GDEF456');

      final restored = RoutingInput.fromJson(json);
      expect(restored.destination, input.destination);
      expect(restored.memoType, input.memoType);
      expect(restored.memoValue, input.memoValue);
      expect(restored.sourceAccount, input.sourceAccount);
    });

    test('round-trip without optional fields', () {
      final input = RoutingInput(
        destination: 'GABC123',
        memoType: 'none',
      );
      final json = input.toJson();
      expect(json.containsKey('memoValue'), false);
      expect(json.containsKey('sourceAccount'), false);

      final restored = RoutingInput.fromJson(json);
      expect(restored.memoValue, isNull);
      expect(restored.sourceAccount, isNull);
    });
  });

  group('RoutingWarning serialization', () {
    test('round-trip', () {
      final warning =
          const RoutingWarning(code: 'test', severity: 'info', message: 'Test');
      final json = warning.toJson();
      final restored = RoutingWarning.fromJson(json);
      expect(restored, warning);
    });

    test('pre-defined constants', () {
      final json = RoutingWarning.memoIgnored.toJson();
      expect(json['code'], 'memo-ignored');
    });
  });

  group('DestinationError serialization', () {
    test('round-trip', () {
      final error =
          DestinationError(code: 'ERR', message: 'Something went wrong');
      final json = error.toJson();
      expect(json['code'], 'ERR');
      expect(json['message'], 'Something went wrong');
      final restored = DestinationError.fromJson(json);
      expect(restored.code, error.code);
      expect(restored.message, error.message);
    });
  });
}
