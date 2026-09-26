/// Platform-guarded monitoring service.
///
/// Uses Dart's conditional import mechanism to select the correct
/// implementation at compile time:
///
/// - On Flutter (mobile/web) targets: initialises Firebase Crashlytics
///   and Sentry for error and crash reporting.
/// - On plain Dart VM / server targets: falls back to a lightweight stub
///   so `packages/core-dart` (and any other pure-Dart consumer) can
///   import this library without pulling in Flutter or Firebase deps.
///
/// Usage:
/// ```dart
/// await MonitoringService.init();
/// ```
library monitoring_service;

export 'monitoring_service_stub.dart'
    if (dart.library.ui) 'monitoring_service_flutter.dart';
