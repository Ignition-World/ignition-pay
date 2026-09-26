import 'package:firebase_analytics/firebase_analytics.dart';

/// Thin wrapper around FirebaseAnalytics for consistent event logging.
class AnalyticsService {
  AnalyticsService._();

  static final AnalyticsService instance = AnalyticsService._();

  final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  FirebaseAnalyticsObserver get observer =>
      FirebaseAnalyticsObserver(analytics: _analytics);

  Future<void> trackEvent(
    String name, {
    Map<String, Object>? parameters,
  }) async {
    await _analytics.logEvent(name: name, parameters: parameters);
  }

  Future<void> setUserId(String? userId) async {
    await _analytics.setUserId(id: userId);
  }

  // --- Predefined events ---

  Future<void> logWalletConnect(String publicKey) => trackEvent(
        'wallet_connect',
        parameters: {'public_key_prefix': publicKey.substring(0, 8)},
      );

  Future<void> logSendInitiated({
    required String assetCode,
    required double amount,
  }) =>
      trackEvent(
        'send_initiated',
        parameters: {'asset_code': assetCode, 'amount': amount},
      );

  Future<void> logSendConfirmed({
    required String assetCode,
    required double amount,
  }) =>
      trackEvent(
        'send_confirmed',
        parameters: {'asset_code': assetCode, 'amount': amount},
      );

  Future<void> logReceiveViewed() => trackEvent('receive_viewed');

  Future<void> logAnchorDepositStarted(String anchorDomain) => trackEvent(
        'anchor_deposit_started',
        parameters: {'anchor': anchorDomain},
      );
}
