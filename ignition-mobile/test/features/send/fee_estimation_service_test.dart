import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:ignition_mobile/features/send/data/fee_estimate.dart';
import 'package:ignition_mobile/features/send/services/fee_estimation_service.dart';

import '../../test_utils.dart';

void main() {
  late MockApiClient mockApiClient;
  late FeeEstimationService service;

  setUpAll(() {
    registerApiClientFallbacks();
  });

  setUp(() {
    mockApiClient = MockApiClient();
    service = FeeEstimationService(
      apiClient: mockApiClient,
      cacheTtl: const Duration(seconds: 60),
    );
  });

  group('FeeEstimationService', () {
    test('fetches fee estimate from API and parses response', () async {
      when(() => mockApiClient.get<dynamic>(
            '/transactions/fee-estimate',
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async => mockResponse({
            'feeAmount': '0.00001',
            'assetCode': 'XLM',
            'fiatAmount': '0.0001',
            'fiatCurrency': 'USD',
            'minimumNetworkFee': '0.00001',
          }));

      final result = await service.estimateFee(
        assetCode: 'XLM',
        amount: '100',
        recipient: 'GABC123',
      );

      expect(result.feeAmount, '0.00001');
      expect(result.assetCode, 'XLM');
      expect(result.fiatAmount, '0.0001');
      expect(result.formattedNative, '0.00001 XLM');

      verify(() => mockApiClient.get<dynamic>(
            '/transactions/fee-estimate',
            queryParameters: {
              'assetCode': 'XLM',
              'amount': '100',
              'recipient': 'GABC123',
            },
          )).called(1);
    });

    test('caches response for 60 seconds and avoids duplicate calls', () async {
      when(() => mockApiClient.get<dynamic>(
            '/transactions/fee-estimate',
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async => mockResponse({
            'feeAmount': '0.00002',
            'assetCode': 'USDC',
          }));

      // First call -> hits API
      final res1 = await service.estimateFee(assetCode: 'USDC');
      expect(res1.feeAmount, '0.00002');

      // Second call immediately -> returns cached value, no new API call
      final res2 = await service.estimateFee(assetCode: 'USDC');
      expect(res2.feeAmount, '0.00002');

      verify(() => mockApiClient.get<dynamic>(
            '/transactions/fee-estimate',
            queryParameters: {'assetCode': 'USDC'},
          )).called(1);

      // Force refresh -> bypasses cache and hits API again
      final res3 = await service.estimateFee(assetCode: 'USDC', forceRefresh: true);
      expect(res3.feeAmount, '0.00002');

      verify(() => mockApiClient.get<dynamic>(
            '/transactions/fee-estimate',
            queryParameters: {'assetCode': 'USDC'},
          )).called(2);
    });

    test('propagates exception when API call fails', () async {
      when(() => mockApiClient.get<dynamic>(
            '/transactions/fee-estimate',
            queryParameters: any(named: 'queryParameters'),
          )).thenThrow(mockDioException(statusCode: 500, message: 'Server Error'));

      expect(
        () => service.estimateFee(assetCode: 'XLM'),
        throwsA(isA<Exception>()),
      );
    });
  });
}
