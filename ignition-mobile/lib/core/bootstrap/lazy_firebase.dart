import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

/// Initialises Firebase Core the first time something actually needs it
/// (#684).
///
/// Firebase used to be started inside `MonitoringService.init`, which ran
/// before `runApp` and therefore blocked the first frame. Now nothing touches
/// Firebase during start-up: the push notification service calls
/// [ensureInitialized] when it is first used, long after the home screen is
/// interactive.
class LazyFirebase {
  const LazyFirebase._();

  static Future<void>? _pending;
  static bool _ready = false;

  /// True once Firebase Core is available.
  static bool get isInitialized => _ready;

  /// Starts Firebase Core, at most once. Concurrent callers share one future.
  static Future<void> ensureInitialized() {
    if (_ready) return Future<void>.value();
    return _pending ??= _initialize().then((_) {
      _ready = true;
    });
  }

  static Future<void> _initialize() async {
    if (kIsWeb) return;

    await Firebase.initializeApp();

    // Forward Flutter framework errors (render exceptions, etc.) to
    // Crashlytics so they appear in the Firebase console.
    FlutterError.onError =
        FirebaseCrashlytics.instance.recordFlutterFatalError;

    // Forward async errors that escape the root Flutter zone.
    PlatformDispatcher.instance.onError = (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };
  }

  /// Test seam: drop the memoised future.
  @visibleForTesting
  static void resetForTesting() {
    _pending = null;
    _ready = false;
  }
}
