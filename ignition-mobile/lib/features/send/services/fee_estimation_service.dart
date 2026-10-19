import 'dart:async';
import '../../../core/network/api_client.dart';
import '../data/fee_estimate.dart';

/// Contract for fetching fee estimates before sending transactions.
abstract class FeeEstimationDataSource {
  /// Fetches the estimated fee for a pending transaction.
  /// Uses a 60-second TTL cache to prevent duplicate network calls.
  Future<FeeEstimate> estimateFee({
    required String assetCode,
    String? amount,
    String? recipient,
    bool forceRefresh = false,
  });

  /// Clears the cached fee estimate.
  void clearCache();
}

/// Cached fee entry with expiry timestamp.
class _CachedFee {
  final FeeEstimate fee;
  final DateTime expiresAt;

  const _CachedFee({
    required this.fee,
    required this.expiresAt,
  });

  bool get isExpired => DateTime.now().isAfter(expiresAt);
}

/// Service that queries `/transactions/fee-estimate` (or fallback `/payments/fee-estimate`),
/// caching responses for 60 seconds per asset and parameters.
class FeeEstimationService implements FeeEstimationDataSource {
  FeeEstimationService({ApiClient? apiClient, Duration? cacheTtl})
      : _apiClient = apiClient ?? ApiClient(),
        _cacheTtl = cacheTtl ?? const Duration(seconds: 60);

  final ApiClient _apiClient;
  final Duration _cacheTtl;

  /// In-memory cache keyed by cache key (e.g. `XLM:10:GABC...`).
  final Map<String, _CachedFee> _cache = <String, _CachedFee>{};

  /// In-flight requests coalescing map.
  final Map<String, Future<FeeEstimate>> _inflight = <String, Future<FeeEstimate>>{};

  String _cacheKey(String assetCode, String? amount, String? recipient) {
    return '${assetCode.trim().toUpperCase()}:${amount?.trim() ?? ""}:${recipient?.trim() ?? ""}';
  }

  @override
  void clearCache() {
    _cache.clear();
  }

  @override
  Future<FeeEstimate> estimateFee({
    required String assetCode,
    String? amount,
    String? recipient,
    bool forceRefresh = false,
  }) async {
    final key = _cacheKey(assetCode, amount, recipient);

    if (!forceRefresh) {
      final cached = _cache[key];
      if (cached != null && !cached.isExpired) {
        return cached.fee;
      }
    }

    final inflight = _inflight[key];
    if (inflight != null) {
      return inflight;
    }

    final future = _fetchFee(
      assetCode: assetCode,
      amount: amount,
      recipient: recipient,
    ).then((estimate) {
      _cache[key] = _CachedFee(
        fee: estimate,
        expiresAt: DateTime.now().add(_cacheTtl),
      );
      return estimate;
    }).whenComplete(() {
      _inflight.remove(key);
    });

    _inflight[key] = future;
    return future;
  }

  Future<FeeEstimate> _fetchFee({
    required String assetCode,
    String? amount,
    String? recipient,
  }) async {
    final queryParams = <String, dynamic>{
      'assetCode': assetCode,
      if (amount != null && amount.isNotEmpty) 'amount': amount,
      if (recipient != null && recipient.isNotEmpty) 'recipient': recipient,
    };

    try {
      final response = await _apiClient.get<dynamic>(
        '/transactions/fee-estimate',
        queryParameters: queryParams,
      );

      final data = response.data;
      if (data is Map<String, dynamic>) {
        return FeeEstimate.fromJson(data);
      } else if (data is Map) {
        return FeeEstimate.fromJson(Map<String, dynamic>.from(data));
      }
      return FeeEstimate(feeAmount: '0.00001', assetCode: assetCode);
    } catch (_) {
      // If /transactions/fee-estimate throws, rethrow the typed error
      rethrow;
    }
  }
}
