import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/features/home/services/home_service.dart';

import '../../../mocks/mock_api_client.dart';

void main() {
  late MockApiClient api;

  final dashboard = <String, dynamic>{
    'profile': {'id': 'u1', 'role': 'user', 'kycStatus': 'verified'},
    'wallets': [
      {
        'id': 'w1',
        'network': 'stellar',
        'balance': '12.50',
        'currency': 'USD',
        'status': 'active',
      },
    ],
    'recentTransactions': [
      {
        'id': 't1',
        'amount': '5.00',
        'assetCode': 'XLM',
        'status': 'completed',
        'createdAt': '2026-09-01T10:00:00Z',
      },
    ],
    'unreadNotifications': [
      {
        'id': 'n1',
        'type': 'payment',
        'title': 'Payment received',
        'createdAt': '2026-09-01T10:00:00Z',
      },
    ],
    'activeCampaigns': <dynamic>[],
  };

  setUpAll(registerApiClientFallbacks);

  setUp(() {
    api = MockApiClient();
  });

  void stubDashboard(Map<String, dynamic> payload) {
    when(() => api.get<dynamic>('/users/me/dashboard'))
        .thenAnswer((_) async => mockResponse(payload));
  }

  test('serves all three slices from a single coalesced dashboard call',
      () async {
    stubDashboard(dashboard);
    final service = HomeService(apiClient: api);

    final results = await Future.wait<Object?>([
      service.fetchBalances(),
      service.fetchTransactions(),
      service.fetchNotifications(),
    ]);

    final balances = results[0] as Map<String, dynamic>;
    final transactions = results[1] as List<Map<String, dynamic>>;
    final notifications = results[2] as List<Map<String, dynamic>>;

    expect(balances, {'USD': '12.50'});
    expect(transactions.single['id'], 't1');
    expect(notifications.single['title'], 'Payment received');
    verify(() => api.get<dynamic>('/users/me/dashboard')).called(1);
  });

  test('starts a fresh request once the previous one has settled', () async {
    stubDashboard(dashboard);
    final service = HomeService(apiClient: api);

    await service.fetchBalances();
    await service.fetchTransactions();

    verify(() => api.get<dynamic>('/users/me/dashboard')).called(2);
  });

  test('returns empty slices when the payload has no dashboard entries',
      () async {
    stubDashboard(<String, dynamic>{'wallets': null});
    final service = HomeService(apiClient: api);

    final balances = await service.fetchBalances();
    final transactions = await service.fetchTransactions();
    final notifications = await service.fetchNotifications();

    expect(balances, isEmpty);
    expect(transactions, isEmpty);
    expect(notifications, isEmpty);
  });

  test('propagates API failures from every slice', () async {
    when(() => api.get<dynamic>('/users/me/dashboard'))
        .thenThrow(mockDioException(statusCode: 500, message: 'boom'));
    final service = HomeService(apiClient: api);

    await expectLater(service.fetchBalances(), throwsA(isA<Exception>()));
    await expectLater(service.fetchTransactions(), throwsA(isA<Exception>()));
    await expectLater(service.fetchNotifications(), throwsA(isA<Exception>()));
  });
}
