import 'package:stellar_address_kit/stellar_address_kit.dart';
import 'package:test/test.dart';

void main() {
  group('DestinationError equality/hashCode/toString', () {
    test('equal when code and message match', () {
      final a = DestinationError(code: 'invalid-memo', message: 'bad memo');
      final b = DestinationError(code: 'invalid-memo', message: 'bad memo');

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('not equal when message differs', () {
      final a = DestinationError(code: 'invalid-memo', message: 'bad memo');
      final b = DestinationError(code: 'invalid-memo', message: 'different');

      expect(a, isNot(equals(b)));
    });

    test('not equal when code differs', () {
      final a = DestinationError(code: 'invalid-memo', message: 'bad memo');
      final b = DestinationError(code: 'other-code', message: 'bad memo');

      expect(a, isNot(equals(b)));
    });

    test('toString is readable', () {
      final err = DestinationError(code: 'invalid-memo', message: 'bad memo');
      expect(
        err.toString(),
        'DestinationError(code: invalid-memo, message: bad memo)',
      );
    });
  });

  group('RoutingResult equality/hashCode', () {
    test('equal when all fields match, including nested warnings', () {
      final a = RoutingResult(
        source: RoutingSource.muxed,
        id: BigInt.from(42),
        warnings: const [RoutingWarning.memoIgnored],
        destinationBaseAccount: 'GABC',
      );
      final b = RoutingResult(
        source: RoutingSource.muxed,
        id: BigInt.from(42),
        warnings: const [RoutingWarning.memoIgnored],
        destinationBaseAccount: 'GABC',
      );

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('not equal when warnings list differs', () {
      final a = RoutingResult(
        source: RoutingSource.muxed,
        destinationBaseAccount: 'GABC',
        warnings: const [RoutingWarning.memoIgnored],
      );
      final b = RoutingResult(
        source: RoutingSource.muxed,
        destinationBaseAccount: 'GABC',
        warnings: const [],
      );

      expect(a, isNot(equals(b)));
    });

    test('not equal when destinationError message differs but code matches', () {
      // Regression test: equality previously only compared
      // destinationError.code, silently ignoring the message field.
      final a = RoutingResult(
        source: RoutingSource.none,
        destinationError:
            DestinationError(code: 'invalid-memo', message: 'first'),
      );
      final b = RoutingResult(
        source: RoutingSource.none,
        destinationError:
            DestinationError(code: 'invalid-memo', message: 'second'),
      );

      expect(a, isNot(equals(b)));
      expect(a.hashCode, isNot(equals(b.hashCode)));
    });

    test('equal when destinationError fully matches', () {
      final a = RoutingResult(
        source: RoutingSource.none,
        destinationError:
            DestinationError(code: 'invalid-memo', message: 'bad memo'),
      );
      final b = RoutingResult(
        source: RoutingSource.none,
        destinationError:
            DestinationError(code: 'invalid-memo', message: 'bad memo'),
      );

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('not equal when memoType/memoValue differ', () {
      final a = RoutingResult(
        source: RoutingSource.memo,
        id: BigInt.from(1),
        memoType: 'id',
        memoValue: '1',
      );
      final b = RoutingResult(
        source: RoutingSource.memo,
        id: BigInt.from(1),
        memoType: 'id',
        memoValue: '2',
      );

      expect(a, isNot(equals(b)));
    });

    test('toString includes key fields for logging', () {
      final result = RoutingResult(
        source: RoutingSource.muxed,
        id: BigInt.from(42),
        destinationBaseAccount: 'GABC',
      );

      final str = result.toString();
      expect(str, contains('RoutingResult('));
      expect(str, contains('source: RoutingSource.muxed'));
      expect(str, contains('id: 42'));
      expect(str, contains('destinationBaseAccount: GABC'));
    });

    test('works correctly as a Set/Map key', () {
      final a = RoutingResult(
        source: RoutingSource.muxed,
        id: BigInt.from(42),
        destinationBaseAccount: 'GABC',
      );
      final b = RoutingResult(
        source: RoutingSource.muxed,
        id: BigInt.from(42),
        destinationBaseAccount: 'GABC',
      );

      final seen = <RoutingResult>{a};
      expect(seen.contains(b), isTrue);
    });
  });
}
