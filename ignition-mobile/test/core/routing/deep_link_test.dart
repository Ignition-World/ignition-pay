import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/routing/deep_link.dart';

void main() {
  final account = 'G${'A' * 55}';

  group('DeepLinkResolver.resolve', () {
    test('resolves the custom scheme to a /pay location', () {
      final target = DeepLinkResolver.resolve(
        Uri.parse('ignitionpay://pay/$account?amount=10&asset=USDC&memo=hi'),
      );

      expect(target, isNotNull);
      expect(target!.path, '/pay/$account');
      expect(target.queryParameters['amount'], '10');
      expect(target.location, '/pay/$account?amount=10&asset=USDC&memo=hi');
    });

    test('resolves an https universal link to the same location', () {
      final target = DeepLinkResolver.resolve(
        Uri.parse('https://ignitionpay.com/pay/$account?amount=42.5&asset=XLM'),
      );

      expect(target?.path, '/pay/$account');
      expect(target?.location, '/pay/$account?amount=42.5&asset=XLM');
    });

    test('accepts the www host', () {
      expect(
        DeepLinkResolver.resolve(
          Uri.parse('https://www.ignitionpay.com/receive'),
        )?.path,
        '/receive',
      );
    });

    test('resolves plain routes without parameters', () {
      expect(
        DeepLinkResolver.resolve(Uri.parse('ignitionpay://send'))?.path,
        '/send',
      );
      expect(
        DeepLinkResolver.resolve(Uri.parse('ignitionpay://transaction/42'))?.path,
        '/transaction/42',
      );
    });

    test('resolves the scheme root to home', () {
      expect(
        DeepLinkResolver.resolve(Uri.parse('ignitionpay://'))?.path,
        '/',
      );
    });

    test('rejects unsupported hosts', () {
      expect(
        DeepLinkResolver.resolve(Uri.parse('https://example.com/pay/$account')),
        isNull,
      );
    });

    test('rejects unsupported routes', () {
      expect(
        DeepLinkResolver.resolve(Uri.parse('ignitionpay://unknown/route')),
        isNull,
      );
      expect(
        DeepLinkResolver.resolve(Uri.parse('https://ignitionpay.com/admin')),
        isNull,
      );
    });

    test('rejects unsupported schemes', () {
      expect(
        DeepLinkResolver.resolve(Uri.parse('ftp://ignitionpay.com/pay/x')),
        isNull,
      );
    });
  });

  group('DeepLinkResolver.locationFor', () {
    test('returns the location for a supported link', () {
      expect(
        DeepLinkResolver.locationFor(
          Uri.parse('ignitionpay://receive'),
        ),
        '/receive',
      );
    });

    test('falls back to home for malformed links', () {
      expect(
        DeepLinkResolver.locationFor(Uri.parse('ignitionpay://bogus')),
        DeepLinkResolver.homeLocation,
      );
      expect(
        DeepLinkResolver.locationFor(
          Uri.parse('https://example.com/anything'),
        ),
        '/',
      );
    });
  });
}
