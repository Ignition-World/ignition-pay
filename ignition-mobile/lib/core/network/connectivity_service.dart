import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Reports whether the device currently has a usable network connection and
/// streams a new value every time connectivity changes.
///
/// Wrapped behind an interface so offline features (e.g. queued send drafts)
/// can be exercised in unit tests without a platform channel.
abstract class ConnectivityService {
  /// Whether the device is online right now.
  Future<bool> isOnline();

  /// Emits `true` when the device regains connectivity and `false` when it
  /// drops. Only distinct transitions are emitted.
  Stream<bool> get onConnectivityChanged;
}

/// Production [ConnectivityService] backed by `connectivity_plus`.
class ConnectivityPlusService implements ConnectivityService {
  ConnectivityPlusService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Future<bool> isOnline() async =>
      _isOnline(await _connectivity.checkConnectivity());

  @override
  Stream<bool> get onConnectivityChanged =>
      _connectivity.onConnectivityChanged.map(_isOnline).distinct();

  /// A connection is usable when at least one transport other than
  /// [ConnectivityResult.none] is reported.
  static bool _isOnline(List<ConnectivityResult> results) =>
      results.any((result) => result != ConnectivityResult.none);
}
