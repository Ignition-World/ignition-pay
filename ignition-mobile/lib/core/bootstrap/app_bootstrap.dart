import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

import 'package:ignition_mobile/core/analytics_service.dart';
import 'package:ignition_mobile/core/bootstrap/env_loader.dart';
import 'package:ignition_mobile/core/bootstrap/lazy_firebase.dart';
import 'package:ignition_mobile/core/monitoring_service.dart';
import 'package:ignition_mobile/core/network/api_client.dart';
import 'package:ignition_mobile/core/network/connectivity_service.dart';
import 'package:ignition_mobile/core/push_notification_service.dart';
import 'package:ignition_mobile/features/send/services/draft_services.dart';
import 'package:ignition_mobile/features/send/services/draft_sync_service.dart';
import 'package:ignition_mobile/router/app_router.dart';

/// A start-up step and how long after `main()` it completed.
typedef StartupTraceEntry = ({String phase, Duration at});

/// Owns the start-up sequence described in #684.
///
/// The sequence is split in three, and only the first one is awaited by
/// `main()`:
///
/// 1. [runCriticalPath] — `.env` (parsed in a background isolate) and the API
///    client. Nothing else the app needs before the first screen renders.
/// 2. [runDeferred] — Firebase, push notifications, offline draft sync and deep
///    links. Fire-and-forget: none of it is needed to draw the home screen.
/// 3. [runAfterFirstFrame] — Sentry/Crashlytics and the analytics flush, both
///    scheduled from a post-frame callback so they cannot compete with the
///    first paint.
///
/// Every step is logged with its offset from `main()`, which is what the
/// before/after numbers in `docs/STARTUP_PERFORMANCE.md` are read from.
class AppBootstrap {
  AppBootstrap({
    required Future<void> Function() loadEnv,
    required void Function() initializeApiClient,
    required Future<void> Function() initializeFirebase,
    required Future<void> Function() initializePushNotifications,
    required Future<void> Function() startDraftSync,
    required Future<void> Function() registerDeepLinks,
    required Future<void> Function() initializeMonitoring,
    required Future<void> Function() flushAnalytics,
    void Function(String message)? log,
    Stopwatch? stopwatch,
  })  : _loadEnv = loadEnv,
        _initializeApiClient = initializeApiClient,
        _initializeFirebase = initializeFirebase,
        _initializePushNotifications = initializePushNotifications,
        _startDraftSync = startDraftSync,
        _registerDeepLinks = registerDeepLinks,
        _initializeMonitoring = initializeMonitoring,
        _flushAnalytics = flushAnalytics,
        _log = log,
        _stopwatch = stopwatch ?? Stopwatch()..start();

  /// Wires the real services. Called once, from `main()`.
  static AppBootstrap production({void Function(String message)? log}) {
    return AppBootstrap(
      loadEnv: () async {
        final result = await EnvLoader.load();
        log?.call(
          '[startup] .env parsed in '
          '${result.parseDuration.inMilliseconds}ms '
          '(background isolate: ${result.usedBackgroundIsolate})',
        );
      },
      initializeApiClient: () => ApiClient().initialize(),
      initializeFirebase: LazyFirebase.ensureInitialized,
      initializePushNotifications: () => PushNotificationService().init(),
      startDraftSync: startDraftSync,
      registerDeepLinks: registerDeepLinks,
      initializeMonitoring: MonitoringService.initAfterFirstFrame,
      flushAnalytics: () =>
          AnalyticsService.instance.markTimeToInteractive(),
      log: log,
    );
  }

  final Future<void> Function() _loadEnv;
  final void Function() _initializeApiClient;
  final Future<void> Function() _initializeFirebase;
  final Future<void> Function() _initializePushNotifications;
  final Future<void> Function() _startDraftSync;
  final Future<void> Function() _registerDeepLinks;
  final Future<void> Function() _initializeMonitoring;
  final Future<void> Function() _flushAnalytics;
  final void Function(String message)? _log;

  final Stopwatch _stopwatch;
  final List<StartupTraceEntry> _trace = <StartupTraceEntry>[];

  /// Ordered log of the completed phases and their offsets from start-up.
  List<StartupTraceEntry> get trace => List<StartupTraceEntry>.unmodifiable(_trace);

  /// Phases that have run, in order.
  List<String> get completedPhases =>
      _trace.map((entry) => entry.phase).toList(growable: false);

  /// The only phase `main()` awaits. Keep it free of plugin and network work:
  /// everything here delays the home screen.
  Future<void> runCriticalPath() async {
    await _run('environment', _loadEnv);
    _runSync('apiClient', _initializeApiClient);
  }

  /// Everything that used to block the first frame and no longer does.
  ///
  /// Failures are logged and swallowed: a push permission prompt or an
  /// unreachable API must not take the app down after it is already running.
  Future<void> runDeferred() async {
    await _run('deferred.firebase', _initializeFirebase);
    await _run('deferred.pushNotifications', _initializePushNotifications);

    // Independent of each other, and both only touch the network.
    await Future.wait(<Future<void>>[
      _run('deferred.draftSync', _startDraftSync),
      _run('deferred.deepLinks', _registerDeepLinks),
    ]);
  }

  /// Crash reporting and analytics, both scheduled after the first frame.
  Future<void> runAfterFirstFrame() async {
    await _run('monitoring', _initializeMonitoring);
    await _run('analytics', _flushAnalytics);
  }

  Future<void> _run(String phase, Future<void> Function() step) async {
    try {
      await step();
    } catch (error) {
      _log?.call('[startup] $phase failed: $error');
    }
    _record(phase);
  }

  void _runSync(String phase, void Function() step) {
    try {
      step();
    } catch (error) {
      _log?.call('[startup] $phase failed: $error');
    }
    _record(phase);
  }

  void _record(String phase) {
    final at = _stopwatch.elapsed;
    _trace.add((phase: phase, at: at));
    _log?.call('[startup] $phase done at ${at.inMilliseconds}ms');
  }

}

/// Flushes any queued offline send drafts as soon as connectivity returns
/// (#678).
Future<void> startDraftSync() async {
  final draftSyncService = DraftSyncService(
    store: DraftServices.store,
    connectivity: ConnectivityPlusService(),
    submit: (draft) async {
      await ApiClient().post<dynamic>(
        '/transactions',
        data: {
          'recipient': draft.recipient,
          'amount': draft.amount,
          'asset': draft.asset,
          if (draft.memo != null) 'memo': draft.memo,
        },
      );
    },
  );
  DraftServices.syncService = draftSyncService;
  await draftSyncService.start();
}

/// Opens the app on the destination of a cold-start link and follows links that
/// arrive while it is running.
///
/// This runs after `runApp`, so `appRouter` already has a delegate attached and
/// `go` is safe to call.
Future<void> registerDeepLinks() async {
  final links = AppLinks();
  final initialLink = await links.getInitialLink();
  if (initialLink != null) {
    appRouter.go(deepLinkLocation(initialLink));
  }
  // The subscription lives for the lifetime of the app, so it is deliberately
  // not awaited or disposed here.
  links.uriLinkStream.listen((uri) => appRouter.go(deepLinkLocation(uri)));
}

/// Logs start-up phases only in debug builds so release start-up does no extra
/// string formatting.
void Function(String message) defaultStartupLog(String message) {
  if (kReleaseMode) return (String _) {};
  return debugPrint;
}
