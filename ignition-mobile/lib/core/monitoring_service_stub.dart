/// Stub [MonitoringService] for Dart VM / server contexts.
///
/// This implementation is selected when [dart.library.ui] is **not** present
/// (i.e. no Flutter engine is available, e.g. a Dart server, CLI tool, or
/// any pure-Dart consumer of `packages/core-dart`).
///
/// All methods are intentional no-ops so that callers can unconditionally
/// call `MonitoringService.init()` without introducing Flutter or Firebase
/// dependencies into non-Flutter build targets.
class MonitoringService {
  MonitoringService._();

  /// Initialises monitoring.
  ///
  /// Accepted for API-signature parity with the Flutter implementation; on the
  /// Dart VM it is a no-op (no Sentry/Crashlytics, no frames to track).
  static Future<void> initAfterFirstFrame() async {}

  /// Records an error to the monitoring backend.
  ///
  /// On the Dart VM this is a no-op.
  static Future<void> recordError(
    Object exception,
    StackTrace? stackTrace, {
    String? reason,
    bool fatal = false,
  }) async {
    // No-op on Dart VM / server targets.
  }

  /// Logs a breadcrumb / informational message.
  ///
  /// On the Dart VM this is a no-op.
  static void log(String message) {
    // No-op on Dart VM / server targets.
  }

  /// Associates subsequent events with the given user [id].
  ///
  /// On the Dart VM this is a no-op.
  static Future<void> setUserId(String? id) async {
    // No-op on Dart VM / server targets.
  }
}
