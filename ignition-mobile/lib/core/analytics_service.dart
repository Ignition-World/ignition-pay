import 'package:firebase_analytics/firebase_analytics.dart';

/// Sends a single analytics event. Injected so tests never touch Firebase.
typedef AnalyticsEventSender = Future<void> Function(
  String name,
  Map<String, Object>? parameters,
);

/// Sets the analytics user id. Injected so tests never touch Firebase.
typedef AnalyticsUserIdSetter = Future<void> Function(String? userId);

/// Thin wrapper around FirebaseAnalytics for consistent event logging.
///
/// Events raised before the app is interactive are queued and flushed by
/// [markTimeToInteractive] (#684). Two reasons: the Firebase plugin is not
/// initialised during start-up any more, and doing plugin work in the frame
/// that paints the home screen competes with the first paint.
class AnalyticsService {
  AnalyticsService({AnalyticsEventSender? sender, AnalyticsUserIdSetter? setUserId})
      : _sender = sender,
        _setUserId = setUserId;

  AnalyticsService._()
      : _sender = null,
        _setUserId = null;

  static final AnalyticsService instance = AnalyticsService._();

  final AnalyticsEventSender? _sender;
  final AnalyticsUserIdSetter? _setUserId;

  final List<_PendingAnalyticsCall> _pending = <_PendingAnalyticsCall>[];

  bool _timeToInteractive = false;

  /// Events and user-id calls raised before [markTimeToInteractive].
  int get pendingCallCount => _pending.length;

  /// True once queued calls have been released to the sender.
  bool get isInteractive => _timeToInteractive;

  /// Marks the app interactive and flushes everything queued up to this point.
  Future<void> markTimeToInteractive() async {
    _timeToInteractive = true;
    final queued = List<_PendingAnalyticsCall>.of(_pending);
    _pending.clear();
    for (final call in queued) {
      await call.send();
    }
  }

  Future<void> trackEvent(
    String name, {
    Map<String, Object>? parameters,
  }) {
    return _enqueue(() => _senderFor()?.call(name, parameters));
  }

  Future<void> setUserId(String? userId) {
    return _enqueue(() => _userIdSetterFor()?.call(userId));
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

  /// FirebaseAnalyticsObserver for route-change reporting. Obtained on demand
  /// because touching `FirebaseAnalytics.instance` requires an initialised
  /// Firebase app.
  FirebaseAnalyticsObserver get observer =>
      FirebaseAnalyticsObserver(analytics: FirebaseAnalytics.instance);

  Future<void> _enqueue(Future<void>? Function() send) {
    if (_timeToInteractive) {
      return _PendingAnalyticsCall(send).run();
    }
    _pending.add(_PendingAnalyticsCall(send));
    return Future<void>.value();
  }

  AnalyticsEventSender? _senderFor() {
    if (_sender != null) return _sender;
    return _defaultSender;
  }

  AnalyticsUserIdSetter? _userIdSetterFor() {
    if (_setUserId != null) return _setUserId;
    return _defaultUserIdSetter;
  }

  /// Created on first use, not in a field initialiser: `FirebaseAnalytics`
  /// throws if Firebase Core has not been initialised yet.
  static final AnalyticsEventSender _defaultSender = _createDefaultSender();
  static final AnalyticsUserIdSetter _defaultUserIdSetter =
      _createDefaultUserIdSetter();

  static AnalyticsEventSender _createDefaultSender() {
    return (String name, Map<String, Object>? parameters) async {
      await FirebaseAnalytics.instance.logEvent(
        name: name,
        parameters: parameters,
      );
    };
  }

  static AnalyticsUserIdSetter _createDefaultUserIdSetter() {
    return (String? userId) async {
      await FirebaseAnalytics.instance.setUserId(id: userId);
    };
  }
}

/// An analytics call raised before the app was interactive.
class _PendingAnalyticsCall {
  const _PendingAnalyticsCall(this.send);

  final Future<void>? Function() send;

  Future<void> run() => send() ?? Future<void>.value();
}
