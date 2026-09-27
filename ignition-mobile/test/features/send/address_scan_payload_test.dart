import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/send/address_scan_payload.dart';

void main() {
  // A well-formed Stellar account id: `G` + 55 base-32 characters.
  final account = 'G${'A' * 55}';
  final otherAccount = 'G${'B' * 55}';

  group('AddressScanParser.isStellarAddress', () {
    test('accepts a 56-character G address', () {
      expect(AddressScanParser.isStellarAddress(account), isTrue);
    });

    test('rejects addresses with invalid characters or length', () {
      expect(AddressScanParser.isStellarAddress('GABC'), isFalse);
      expect(AddressScanParser.isStellarAddress('G${'A' * 54}0'), isFalse);
      expect(AddressScanParser.isStellarAddress('S${'A' * 55}'), isFalse);
    });
  });

  group('AddressScanParser.parse', () {
    test('parses a bare Stellar address', () {
      final result = AddressScanParser.parse(account);

      expect(result, isNotNull);
      expect(result!.address, account);
      expect(result.amount, isNull);
      expect(result.asset, isNull);
      expect(result.memo, isNull);
    });

    test('parses a stellar: SEP-0007 URI with amount, asset and memo', () {
      final result = AddressScanParser.parse(
        'stellar:$account?amount=10&asset=USDC&memo=hello',
      );

      expect(result, isNotNull);
      expect(result!.address, account);
      expect(result.amount, '10');
      expect(result.asset, 'USDC');
      expect(result.memo, 'hello');
    });

    test('parses an ignitionpay:// deep link', () {
      final result = AddressScanParser.parse(
        'ignitionpay://pay/$account?amount=10&asset=USDC&memo=hi',
      );

      expect(result, isNotNull);
      expect(result!.address, account);
      expect(result.amount, '10');
      expect(result.asset, 'USDC');
      expect(result.memo, 'hi');
    });

    test('parses an https universal link', () {
      final result = AddressScanParser.parse(
        'https://ignitionpay.com/pay/$account?amount=42.5&asset=XLM',
      );

      expect(result, isNotNull);
      expect(result!.address, account);
      expect(result.amount, '42.5');
      expect(result.asset, 'XLM');
    });

    test('parses the www universal-link host', () {
      final result = AddressScanParser.parse(
        'https://www.ignitionpay.com/pay/$otherAccount',
      );

      expect(result?.address, otherAccount);
    });

    test('supports the destination query parameter for SEP-0007 reservations',
        () {
      final result = AddressScanParser.parse(
        'stellar:pay?destination=$account&amount=5',
      );

      expect(result?.address, account);
      expect(result?.amount, '5');
    });

    test('trims surrounding whitespace', () {
      expect(AddressScanParser.parse('  $account\n')?.address, account);
    });

    test('rejects empty input', () {
      expect(AddressScanParser.parse(''), isNull);
      expect(AddressScanParser.parse('   '), isNull);
    });

    test('rejects non-payment payloads', () {
      expect(AddressScanParser.parse('https://example.com/pay/$account'), isNull);
      expect(AddressScanParser.parse('just some text'), isNull);
      expect(AddressScanParser.parse('ignitionpay://pay/not-an-address'), isNull);
    });

    test('treats an explicit empty amount as absent', () {
      final result = AddressScanParser.parse(account);
      expect(result?.hasAmount, isFalse);
      expect(result?.hasMemo, isFalse);
    });

    test('reports an encoded amount as present', () {
      final result = AddressScanParser.parse(
        'ignitionpay://pay/$account?amount=1.5',
      );
      expect(result?.hasAmount, isTrue);
    });
  });
}
