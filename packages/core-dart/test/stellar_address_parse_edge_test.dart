import 'package:test/test.dart';
import 'package:stellar_address_kit/stellar_address_kit.dart';

void main() {
  group('StellarAddress.parse — muxed base-G extraction', () {
    test('parsing an M-address exposes a consistent, valid base G address',
        () {
      const validG =
          'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI';
      final mAddress =
          MuxedAddress.encode(baseG: validG, id: BigInt.from(42));

      final parsed = StellarAddress.parse(mAddress);

      expect(parsed.kind, AddressKind.m);
      expect(parsed.baseG, validG);
      expect(StellarAddress.parse(parsed.baseG!).kind, AddressKind.g);
    });
  });

  group('StellarAddress.parse — malformed input', () {
    test('throws for an empty string', () {
      expect(() => StellarAddress.parse(''),
          throwsA(isA<StellarAddressException>()));
    });

    test('throws for an unknown prefix', () {
      expect(() => StellarAddress.parse('NOTANADDRESS'),
          throwsA(isA<StellarAddressException>()));
    });

    test('throws for a truncated M-address', () {
      expect(() => StellarAddress.parse('MA7QYNF7SOWQ3'),
          throwsA(isA<StellarAddressException>()));
    });

    test('throws for a G-address with a tampered checksum', () {
      const tampered =
          'GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSX';
      expect(() => StellarAddress.parse(tampered),
          throwsA(isA<StellarAddressException>()));
    });
  });
}
