/// Flutter/Firebase [MonitoringService] implementation for mobile and web.
///
/// This implementation is selected when [dart.library.ui] is present
/// (i.e. a Flutter engine is available).
///
/// Initialises:
/// - **Firebase Crashlytics** — automatic crash reporting on Android/iOS.
///   Skipped on Flutter Web (Crashlytics does not support web).
/// - **Sentry** — error and performance monitoring (configured via
///   `--dart-define=SENTRY_DSN=<dsn>` at build time, or via `.env`).
///
/// Usage in main.dart:
/// ```dart
/// await MonitoringService.init(
///   runApp: () async {
///     runApp(const MyApp());
///   },
/// );
/// ```
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

class MonitoringService {
  MonitoringService._();

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  /// Initialises crash reporting and error monitoring.
  ///
  /// Call this **after** the first frame has been rendered (#684): Sentry
  /// installs global error handlers, patches the navigator observer and
  /// starts its own frame instrumentation, and doing that work before the home
  /// screen paints makes the first frame measurably slower. `main()` invokes
  /// it from a post-frame callback.
  ///
  /// Crashlytics no longer needs anything here: Firebase Core is initialised
  /// lazily by `LazyFirebase` and installs the Crashlytics error handlers
  /// itself.
  static Future<void> initAfterFirstFrame() async {
    WidgetsFlutterBinding.ensureInitialized();
    _initializeFrameTracking();

    // SENTRY_DSN is injected at build time via:
    //   flutter run --dart-define=SENTRY_DSN=https://...
    const sentryDsn = String.fromEnvironment('SENTRY_DSN');
    if (sentryDsn.isEmpty) return;

    // Keep whatever Crashlytics installed (or the default handler) so
    // initialising Sentry after the first frame does not silently drop errors
    // that were already being reported.
    final previousOnError = FlutterError.onError;

    await SentryFlutter.init(
      (options) {
        options.dsn = sentryDsn;
        // Capture 100 % of traces; tune down in high-traffic production.
        options.tracesSampleRate = 1.0;
        options.attachStacktrace = true;
        options.environment = kReleaseMode ? 'production' : 'development';
      },
    );

    final sentryOnError = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails details) {
      sentryOnError?.call(details);
      if (previousOnError != null && previousOnError != sentryOnError) {
        previousOnError(details);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Performance & Rebuild Tracking
  // ---------------------------------------------------------------------------
  //
  // Interpreting Performance Data in Sentry:
  // - Frame Rate Trend: Sentry automatically tracks app performance. View the
  //   "Performance" tab in Sentry to see overall frame rate and UI load trends.
  // - Jank & Slow Frames: Frames exceeding 16ms generate custom `ui.render`
  //   transactions with the `frame_jank` operation. They appear in the 
  //   Performance tab. Look for warnings tagged with `jank: true`.
  // - Timing Spans: Each janky frame includes child spans for `ui.render.build` 
  //   and `ui.render.raster`, showing exactly where the time was spent.
  // - Widget Rebuild Alerts: Search for "Excessive rebuilds" in the Sentry
  //   "Issues" tab to find screens rebuilding >50 times per minute.

  static final Map<String, int> _rebuildCounts = {};
  static final Map<String, DateTime> _rebuildTimeWindow = {};
  static bool _frameTrackingInitialized = false;

  /// Tracks a widget rebuild for a specific screen (e.g. 'home', 'send', 'receive').
  ///
  /// Call this inside the [build] method of key screens.
  /// If rebuilds exceed 50 per minute, an alert is sent to Sentry.
  /// Performance data is collected only in production builds.
  static void trackRebuild(String screenName) {
    if (!kReleaseMode) return;

    final now = DateTime.now();
    _rebuildTimeWindow.putIfAbsent(screenName, () => now);
    _rebuildCounts[screenName] = (_rebuildCounts[screenName] ?? 0) + 1;

    final timeSinceStart = now.difference(_rebuildTimeWindow[screenName]!);

    if (timeSinceStart.inMinutes >= 1) {
      final count = _rebuildCounts[screenName]!;
      if (count > 50) {
        Sentry.captureMessage(
          'Excessive rebuilds on $screenName: $count rebuilds/min',
          level: SentryLevel.warning,
        );
      }
      
      // Reset window
      _rebuildTimeWindow[screenName] = now;
      _rebuildCounts[screenName] = 0;
    }
  }

  /// Initializes Flutter frame performance tracking.
  static void _initializeFrameTracking() {
    if (!kReleaseMode || _frameTrackingInitialized) return;
    _frameTrackingInitialized = true;

    // Use SchedulerBinding to track frame timings with <1ms overhead
    SchedulerBinding.instance.addTimingsCallback((List<FrameTiming> timings) {
      for (final timing in timings) {
        final buildTimeMs = timing.buildDuration.inMicroseconds / 1000.0;
        final rasterTimeMs = timing.rasterDuration.inMicroseconds / 1000.0;
        final totalTimeMs = buildTimeMs + rasterTimeMs;

        // Flag frames >16ms as jank and report to Sentry with timing spans
        if (totalTimeMs > 16.0) {
          final end = DateTime.now();
          final start = end.subtract(Duration(microseconds: (totalTimeMs * 1000).toInt()));
          
          final transaction = Sentry.startTransaction(
            'ui.render',
            'frame_jank',
            description: 'Janky Frame',
            startTimestamp: start,
          );
          
          transaction.setTag('jank', 'true');

          final buildSpan = transaction.startChild(
            'ui.render.build',
            description: 'Build Phase',
            startTimestamp: start,
          );
          final buildEnd = start.add(timing.buildDuration);
          buildSpan.finish(endTimestamp: buildEnd);

          final rasterSpan = transaction.startChild(
            'ui.render.raster',
            description: 'Raster Phase',
            startTimestamp: buildEnd,
          );
          rasterSpan.finish(endTimestamp: buildEnd.add(timing.rasterDuration));

          transaction.finish(endTimestamp: end);
          
          Sentry.captureMessage(
            'Jank detected: Frame took ${totalTimeMs.toStringAsFixed(2)}ms',
            level: SentryLevel.warning,
          );
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Error reporting
  // ---------------------------------------------------------------------------

  /// Records [exception] and its [stackTrace] to all active monitoring
  /// backends (Crashlytics and Sentry).
  ///
  /// Set [fatal] to `true` for unrecoverable errors.  Supply an optional
  /// [reason] string to add human-readable context in the dashboards.
  static Future<void> recordError(
    Object exception,
    StackTrace? stackTrace, {
    String? reason,
    bool fatal = false,
  }) async {
    if (!kIsWeb) {
      await FirebaseCrashlytics.instance.recordError(
        exception,
        stackTrace,
        reason: reason,
        fatal: fatal,
      );
    }
    await Sentry.captureException(
      exception,
      stackTrace: stackTrace,
      hint: reason != null ? Hint.withMap({'reason': reason}) : null,
    );
  }

  // ---------------------------------------------------------------------------
  // Breadcrumbs / logging
  // ---------------------------------------------------------------------------

  /// Adds a breadcrumb to Sentry and, on non-web builds, a log line to
  /// Crashlytics so it appears alongside crash reports.
  static void log(String message) {
    if (!kIsWeb) {
      FirebaseCrashlytics.instance.log(message);
    }
    Sentry.addBreadcrumb(Breadcrumb(message: message));
  }

  // ---------------------------------------------------------------------------
  // User identity
  // ---------------------------------------------------------------------------

  /// Associates subsequent monitoring events with the given user [id].
  ///
  /// Pass `null` to clear the identity on sign-out.
  static Future<void> setUserId(String? id) async {
    if (!kIsWeb) {
      await FirebaseCrashlytics.instance.setUserIdentifier(id ?? '');
    }
    await Sentry.configureScope(
      (scope) => scope.setUser(id != null ? SentryUser(id: id) : null),
    );
  }
}
