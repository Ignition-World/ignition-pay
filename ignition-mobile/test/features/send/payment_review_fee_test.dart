import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/send/data/fee_estimate.dart';
import 'package:ignition_mobile/features/send/payment_review_page.dart';
import 'package:ignition_mobile/features/send/send_confirmation_sheet.dart';
import 'package:ignition_mobile/features/send/services/fee_estimation_service.dart';

import '../../test_utils.dart';

class FakeFeeEstimationService implements FeeEstimationDataSource {
  FakeFeeEstimationService({
    this.feeToReturn,
    this.shouldThrow = false,
  });

  FeeEstimate? feeToReturn;
  bool shouldThrow;
  int callCount = 0;

  @override
  Future<FeeEstimate> estimateFee({
    required String assetCode,
    String? amount,
    String? recipient,
    bool forceRefresh = false,
  }) async {
    callCount++;
    if (shouldThrow) {
      throw Exception('API error');
    }
    return feeToReturn ??
        FeeEstimate(
          feeAmount: '0.00001',
          assetCode: assetCode,
          fiatAmount: '0.0001',
          fiatCurrency: 'USD',
          minimumNetworkFee: '0.00001',
        );
  }

  @override
  void clearCache() {}
}

void main() {
  final validAddress = 'G${'A' * 55}';

  group('PaymentReviewPage fee estimation display flow', () {
    testWidgets('displays estimated fee before confirmation sheet',
        (tester) async {
      final fakeService = FakeFeeEstimationService(
        feeToReturn: const FeeEstimate(
          feeAmount: '0.00002',
          assetCode: 'XLM',
          fiatAmount: '0.002',
          fiatCurrency: 'USD',
          minimumNetworkFee: '0.00001',
        ),
      );

      await tester.pumpWidget(
        testApp(
          PaymentReviewPage(
            initialAddress: validAddress,
            initialAmount: '10',
            initialAsset: 'XLM',
            feeEstimationService: fakeService,
          ),
        ),
      );

      // Settle async fetch
      await tester.pumpAndSettle();

      // Verify fee estimate is displayed in the page form before opening confirmation sheet
      expect(find.byKey(const Key('fee_disclosure_section')), findsOneWidget);
      expect(find.text('0.00002 XLM'), findsOneWidget);
      expect(find.text('≈ $0.002'), findsOneWidget);
      expect(find.text('Minimum network fee: 0.00001 XLM'), findsOneWidget);

      // Tap 'Review and send' to open bottom sheet
      await tester.tap(find.text('Review and send'));
      await tester.pumpAndSettle();

      // Verify confirmation sheet opens with the estimated fee
      expect(find.byType(SendConfirmationSheet), findsOneWidget);
      expect(find.text('0.00002 XLM'), findsWidgets);
    });

    testWidgets('shows retry on error and succeeds on retry', (tester) async {
      final fakeService = FakeFeeEstimationService(shouldThrow: true);

      await tester.pumpWidget(
        testApp(
          PaymentReviewPage(
            initialAddress: validAddress,
            initialAmount: '10',
            initialAsset: 'XLM',
            feeEstimationService: fakeService,
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Should show error state
      expect(
        find.text('Failed to estimate network fee. Tap to retry.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('fee_retry_button')), findsOneWidget);

      // Now service recovers
      fakeService.shouldThrow = false;
      fakeService.feeToReturn = const FeeEstimate(
        feeAmount: '0.00005',
        assetCode: 'XLM',
      );

      await tester.tap(find.byKey(const Key('fee_retry_button')));
      await tester.pumpAndSettle();

      // Error banner gone, fee displayed
      expect(
        find.text('Failed to estimate network fee. Tap to retry.'),
        findsNothing,
      );
      expect(find.text('0.00005 XLM'), findsOneWidget);
    });
  });
}
