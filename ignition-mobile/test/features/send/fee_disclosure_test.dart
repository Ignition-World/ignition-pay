import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/send/data/fee_estimate.dart';
import 'package:ignition_mobile/features/send/fee_disclosure.dart';

import '../../test_utils.dart';

void main() {
  group('FeeEstimate parsing and formatting', () {
    test('parses camelCase json correctly', () {
      final json = {
        'feeAmount': '0.00001',
        'assetCode': 'XLM',
        'fiatAmount': '0.0001',
        'fiatCurrency': 'USD',
        'minimumNetworkFee': '0.00001',
        'feeType': 'standard',
      };

      final estimate = FeeEstimate.fromJson(json);

      expect(estimate.feeAmount, '0.00001');
      expect(estimate.assetCode, 'XLM');
      expect(estimate.fiatAmount, '0.0001');
      expect(estimate.fiatCurrency, 'USD');
      expect(estimate.minimumNetworkFee, '0.00001');
      expect(estimate.formattedNative, '0.00001 XLM');
      expect(estimate.formattedFiat, '≈ $0.0001');
      expect(estimate.hasComparison, isFalse);
    });

    test('parses snake_case json correctly', () {
      final json = {
        'fee_amount': '0.00002',
        'fee_asset_code': 'USDC',
        'approximate_fiat': '0.0002',
        'fiat_currency': 'EUR',
        'minimum_network_fee': '0.00001',
      };

      final estimate = FeeEstimate.fromJson(json);

      expect(estimate.feeAmount, '0.00002');
      expect(estimate.assetCode, 'USDC');
      expect(estimate.fiatAmount, '0.0002');
      expect(estimate.fiatCurrency, 'EUR');
      expect(estimate.minimumNetworkFee, '0.00001');
      expect(estimate.formattedNative, '0.00002 USDC');
      expect(estimate.formattedFiat, '≈ 0.0002 EUR');
      expect(estimate.hasComparison, isTrue);
    });

    test('parses nested data envelope response', () {
      final json = {
        'success': true,
        'data': {
          'feeAmount': '0.00005',
          'assetCode': 'XLM',
          'fiatAmount': '0.005',
        },
      };

      final estimate = FeeEstimate.fromJson(json);
      expect(estimate.feeAmount, '0.00005');
      expect(estimate.assetCode, 'XLM');
      expect(estimate.fiatAmount, '0.005');
    });

    test('handles fallback when fields are omitted', () {
      final estimate = FeeEstimate.fromJson({});
      expect(estimate.feeAmount, '0.00001');
      expect(estimate.assetCode, 'XLM');
      expect(estimate.fiatAmount, isNull);
      expect(estimate.formattedFiat, isNull);
    });
  });

  group('FeeDisclosure widget display', () {
    testWidgets('renders direct feeAmount and assetCode', (tester) async {
      await tester.pumpWidget(
        testApp(
          const FeeDisclosure(
            feeAmount: '0.00001',
            assetCode: 'XLM',
          ),
        ),
      );

      expect(find.text('Network fee'), findsOneWidget);
      expect(find.text('0.00001 XLM'), findsOneWidget);
    });

    testWidgets('renders loading state when isLoading is true', (tester) async {
      await tester.pumpWidget(
        testApp(
          const FeeDisclosure(
            isLoading: true,
          ),
        ),
      );

      expect(find.text('Estimating network fee…'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders error state with retry button', (tester) async {
      var retryTapped = false;
      await tester.pumpWidget(
        testApp(
          FeeDisclosure(
            errorMessage: 'Network error occurred',
            onRetry: () => retryTapped = true,
          ),
        ),
      );

      expect(find.text('Network error occurred'), findsOneWidget);
      expect(find.byKey(const Key('fee_retry_button')), findsOneWidget);

      await tester.tap(find.byKey(const Key('fee_retry_button')));
      await tester.pump();

      expect(retryTapped, isTrue);
    });

    testWidgets('renders fee with fiat equivalent and minimum comparison', (tester) async {
      const estimate = FeeEstimate(
        feeAmount: '0.00005',
        assetCode: 'XLM',
        fiatAmount: '0.01',
        fiatCurrency: 'USD',
        minimumNetworkFee: '0.00001',
      );

      await tester.pumpWidget(
        testApp(
          const FeeDisclosure(
            feeEstimate: estimate,
          ),
        ),
      );

      expect(find.text('Network fee'), findsOneWidget);
      expect(find.text('0.00005 XLM'), findsOneWidget);
      expect(find.text('≈ $0.01'), findsOneWidget);
      expect(find.text('Minimum network fee: 0.00001 XLM'), findsOneWidget);
    });
  });
}
