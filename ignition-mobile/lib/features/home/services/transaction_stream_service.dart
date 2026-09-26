import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'package:ignition_mobile/config/env_config.dart';
import 'package:ignition_mobile/core/network/api_client.dart';
import 'package:ignition_mobile/features/home/models/transaction_status.dart';

/// Service for handling real-time transaction updates via SSE with polling fallback.
class TransactionStreamService {
  TransactionStreamService({
    required ApiClient apiClient,
    required EnvConfig envConfig,
  })  : _apiClient = apiClient,
        _envConfig = envConfig;

  final ApiClient _apiClient;
  final EnvConfig _envConfig;

  http.Client? _sseClient;
  Timer? _reconnectTimer;
  Timer? _pollingTimer;
  bool _isDisposed = false;
  bool _isInBackground = false;
  bool _usePolling = false;
  String? _lastEventId;

  final _transactionController =
      StreamController<List<TransactionModel>>.broadcast();
  final _connectionStateController =
      StreamController<TransactionConnectionState>.broadcast();

  Stream<List<TransactionModel>> get transactionsStream =>
      _transactionController.stream;

  Stream<TransactionConnectionState> get connectionStateStream =>
      _connectionStateController.stream;

  /// Initializes the stream connection (SSE or polling).
  Future<void> initialize() async {
    if (_isDisposed) return;

    await _connectSSE();
  }

  /// Attempts to connect via SSE, falls back to polling on failure.
  Future<void> _connectSSE() async {
    if (_isDisposed || _isInBackground) return;

    _updateConnectionState(TransactionConnectionState.connecting);

    try {
      final uri = Uri.parse('${_envConfig.apiBaseUrl}/transactions/stream');
      final token = _apiClient.getAuthToken();

      if (token == null) {
        throw Exception('No auth token available');
      }

      _sseClient = http.Client();
      final request = http.Request('GET', uri)
        ..headers.addAll({
          'Authorization': 'Bearer $token',
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        });

      if (_lastEventId != null) {
        request.headers['Last-Event-ID'] = _lastEventId!;
      }

      final response = await _sseClient!.send(request);

      if (response.statusCode == 200) {
        _usePolling = false;
        _updateConnectionState(TransactionConnectionState.connected);
        _listenToSSE(response.stream);
      } else {
        throw Exception('SSE connection failed: ${response.statusCode}');
      }
    } catch (e) {
      if (_envConfig.isDebug) {
        debugPrint('SSE connection failed, falling back to polling: $e');
      }
      _usePolling = true;
      _startPolling();
    }
  }

  /// Listens to the SSE stream and parses events.
  void _listenToSSE(Stream<List<int>> stream) {
    final decoder = utf8.decoder;
    String buffer = '';

    stream.transform(decoder).listen(
      (chunk) {
        buffer += chunk;
        final lines = buffer.split('\n');
        buffer = lines.removeLast();

        for (final line in lines) {
          _parseSSELine(line);
        }
      },
      onError: (Object error) {
        if (_envConfig.isDebug) {
          debugPrint('SSE stream error: $error');
        }
        _handleDisconnect();
      },
      onDone: () {
        if (_envConfig.isDebug) {
          debugPrint('SSE stream closed');
        }
        _handleDisconnect();
      },
      cancelOnError: true,
    );
  }

  /// Parses a single SSE line.
  void _parseSSELine(String line) {
    if (line.startsWith('id:')) {
      _lastEventId = line.substring(3).trim();
    } else if (line.startsWith('data:')) {
      final data = line.substring(5).trim();
      if (data.isNotEmpty && data != 'ping') {
        try {
          final json = jsonDecode(data) as Map<String, dynamic>;
          final transaction = TransactionModel.fromJson(json);
          _handleTransactionUpdate(transaction);
        } catch (e) {
          if (_envConfig.isDebug) {
            debugPrint('Failed to parse SSE data: $e');
          }
        }
      }
    } else if (line.startsWith('event:')) {
      // Handle named events if needed
    }
  }

  /// Handles a transaction status update from the stream.
  void _handleTransactionUpdate(TransactionModel transaction) {
    _transactionController.add([transaction]);
  }

  /// Starts polling fallback (every 30 seconds).
  void _startPolling() {
    _pollingTimer?.cancel();
    _updateConnectionState(TransactionConnectionState.polling);

    _pollingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!_isDisposed && !_isInBackground) {
        pollTransactions();
      }
    });

    // Initial poll
    pollTransactions();
  }

  /// Polls for transaction updates (public for manual refresh).
  Future<void> pollTransactions() async {
    try {
      final response = await _apiClient.get<dynamic>('/transactions');
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
          final transactions = data
              .map((json) => TransactionModel.fromJson(json as Map<String, dynamic>))
              .toList();
          _transactionController.add(transactions);
        }
      }
    } catch (e) {
      if (_envConfig.isDebug) {
        debugPrint('Polling failed: $e');
      }
    }
  }

  /// Handles disconnection and schedules reconnection.
  void _handleDisconnect() {
    _sseClient?.close();
    _sseClient = null;

    if (_isDisposed || _isInBackground) return;

    _updateConnectionState(TransactionConnectionState.reconnecting);

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      if (!_isDisposed && !_isInBackground) {
        if (_usePolling) {
          _startPolling();
        } else {
          _connectSSE();
        }
      }
    });
  }

  /// Updates the connection state and notifies listeners.
  void _updateConnectionState(TransactionConnectionState state) {
    if (!_isDisposed && !_connectionStateController.isClosed) {
      _connectionStateController.add(state);
    }
  }

  /// Called when app goes to background.
  void onAppBackground() {
    _isInBackground = true;
    _sseClient?.close();
    _sseClient = null;
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    _updateConnectionState(TransactionConnectionState.paused);
  }

  /// Called when app returns to foreground.
  void onAppForeground() {
    _isInBackground = false;
    if (!_isDisposed) {
      if (_usePolling) {
        _startPolling();
      } else {
        _connectSSE();
      }
    }
  }

  /// Disposes all resources.
  void dispose() {
    _isDisposed = true;
    _sseClient?.close();
    _sseClient = null;
    _reconnectTimer?.cancel();
    _pollingTimer?.cancel();
    _transactionController.close();
    _connectionStateController.close();
  }
}

/// Represents the current connection state of the transaction stream.
enum TransactionConnectionState {
  connecting,
  connected,
  polling,
  reconnecting,
  paused,
  error,
}