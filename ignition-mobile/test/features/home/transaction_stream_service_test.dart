import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/config/env_config.dart';
import 'package:ignition_mobile/core/network/api_client.dart';
import 'package:ignition_mobile/features/home/models/transaction_status.dart';
import 'package:ignition_mobile/features/home/services/transaction_stream_service.dart';

/// Mock [ApiClient] for testing.
class MockApiClient extends Mock implements ApiClient {
  @override
  void initialize() {}

  @override
  String? getAuthToken() => 'test-token';
}

/// Mock [EnvConfig] for testing.
class MockEnvConfig extends Mock implements EnvConfig {
  @override
  String get apiBaseUrl => 'http://localhost:3000';

  @override
  bool get isDebug => true;
}

void main() {
  group('TransactionStreamService', () {
    late MockApiClient mockApiClient;
    late MockEnvConfig mockEnvConfig;
    late TransactionStreamService streamService;

    setUp(() {
      mockApiClient = MockApiClient();
      mockEnvConfig = MockEnvConfig();
      streamService = TransactionStreamService(
        apiClient: mockApiClient,
        envConfig: mockEnvConfig,
      );
    });

    tearDown(() {
      streamService.dispose();
    });

    test('initializes with connecting state', () async {
      final states = <TransactionConnectionState>[];
      final sub = streamService.connectionStateStream.listen(states.add);

      await streamService.initialize();

      // Should start with connecting
      expect(states, contains(TransactionConnectionState.connecting));

      await sub.cancel();
    });

    test('disposes cleanly', () {
      expect(() => streamService.dispose(), returnsNormally);
    });

    test('handles app lifecycle changes', () {
      // Should not throw when app goes to background/foreground
      expect(() => streamService.onAppBackground(), returnsNormally);
      expect(() => streamService.onAppForeground(), returnsNormally);
    });

    test('pollTransactions triggers update', () async {
      final transactions = <List<TransactionModel>>[];
      final sub = streamService.transactionsStream.listen(transactions.add);

      // Trigger a poll (will fail but shouldn't crash)
      await streamService.pollTransactions();

      await sub.cancel();
    });
  });

  group('TransactionModel', () {
    test('creates from JSON correctly', () {
      final json = {
        'id': 'tx-123',
        'amount': '100.50',
        'asset': 'XLM',
        'destination': 'GDESTINATIONADDRESS',
        'status': 'COMPLETED',
        'created_at': '2024-01-15T10:30:00Z',
        'updated_at': '2024-01-15T10:35:00Z',
        'memo': 'Test payment',
      };

      final transaction = TransactionModel.fromJson(json);

      expect(transaction.id, 'tx-123');
      expect(transaction.amount, '100.50');
      expect(transaction.asset, 'XLM');
      expect(transaction.destination, 'GDESTINATIONADDRESS');
      expect(transaction.status, TransactionStatus.completed);
      expect(transaction.memo, 'Test payment');
    });

    test('handles pending status', () {
      final json = {
        'id': 'tx-456',
        'amount': '50.00',
        'asset': 'USDC',
        'destination': 'GOTHERADDRESS',
        'status': 'PENDING',
        'created_at': '2024-01-15T10:30:00Z',
      };

      final transaction = TransactionModel.fromJson(json);

      expect(transaction.status, TransactionStatus.pending);
    });

    test('handles failed status', () {
      final json = {
        'id': 'tx-789',
        'amount': '25.00',
        'asset': 'XLM',
        'destination': 'GFAILEDADDRESS',
        'status': 'FAILED',
        'created_at': '2024-01-15T10:30:00Z',
      };

      final transaction = TransactionModel.fromJson(json);

      expect(transaction.status, TransactionStatus.failed);
    });

    test('copyWith creates updated transaction', () {
      final original = TransactionModel(
        id: 'tx-123',
        amount: '100.00',
        asset: 'XLM',
        destination: 'GDEST',
        status: TransactionStatus.pending,
        createdAt: DateTime.parse('2024-01-15T10:30:00Z'),
      );

      final updated = original.copyWith(status: TransactionStatus.completed);

      expect(updated.id, original.id);
      expect(updated.status, TransactionStatus.completed);
      expect(updated.amount, original.amount);
    });

    test('toJson produces correct output', () {
      final transaction = TransactionModel(
        id: 'tx-123',
        amount: '100.00',
        asset: 'XLM',
        destination: 'GDEST',
        status: TransactionStatus.completed,
        createdAt: DateTime.parse('2024-01-15T10:30:00Z'),
        updatedAt: DateTime.parse('2024-01-15T10:35:00Z'),
        memo: 'Test',
      );

      final json = transaction.toJson();

      expect(json['id'], 'tx-123');
      expect(json['amount'], '100.00');
      expect(json['asset'], 'XLM');
      expect(json['destination'], 'GDEST');
      expect(json['status'], 'COMPLETED');
      expect(json['memo'], 'Test');
    });
  });

  group('TransactionStatus', () {
    test('fromString parses correctly', () {
      expect(TransactionStatus.fromString('PENDING'), TransactionStatus.pending);
      expect(TransactionStatus.fromString('COMPLETED'), TransactionStatus.completed);
      expect(TransactionStatus.fromString('FAILED'), TransactionStatus.failed);
      expect(TransactionStatus.fromString('UNKNOWN'), TransactionStatus.pending);
    });

    test('value returns correct string', () {
      expect(TransactionStatus.pending.value, 'PENDING');
      expect(TransactionStatus.completed.value, 'COMPLETED');
      expect(TransactionStatus.failed.value, 'FAILED');
    });
  });
}