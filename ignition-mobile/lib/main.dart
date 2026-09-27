import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'app.dart';
import 'core/bootstrap/app_bootstrap.dart';
import 'core/bootstrap/splash_app.dart';
import 'router/app_router.dart';
import 'core/monitoring_service.dart';
import 'core/network/api_client.dart';
import 'core/network/connectivity_service.dart';
import 'core/push_notification_service.dart';
import 'features/notifications/services/notification_center_service.dart';
import 'features/notifications/services/notification_tap_coordinator.dart';
import 'features/send/services/draft_services.dart';
import 'features/send/services/draft_sync_service.dart';

/// App entry point.
///
/// Before #684 this function awaited `.env`, Firebase, Sentry, analytics and a
/// deep-link round trip *before* calling `runApp`, so none of that could
/// overlap with the first frame. Now the splash is painted first, only the
/// critical path is awaited, and everything else is deferred:
///
/// 1. `runApp(SplashApp())` — first frame, no plugin or asset work.
/// 2. `runCriticalPath()` — `.env` (parsed in a background isolate) and the API
///    client.
/// 3. `runApp(IgnitionPayApp())` — the home screen renders.
/// 4. `runDeferred()` — Firebase, push notifications, offline draft sync and
///    deep links, unawaited.
/// 5. First post-frame callback — Sentry/Crashlytics and the analytics flush.
///
/// Phase timings are logged as `[startup] <phase> done at <n>ms`; see
/// `docs/STARTUP_PERFORMANCE.md`.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final bootstrap = AppBootstrap.production(log: defaultStartupLog);

  runApp(const SplashApp());

  await bootstrap.runCriticalPath();

  runApp(const IgnitionPayApp());

  unawaited(bootstrap.runDeferred());

  SchedulerBinding.instance.addPostFrameCallback(
    (_) => unawaited(bootstrap.runAfterFirstFrame()),
  // Load environment variables from .env (API_BASE_URL, SENTRY_DSN, …)
  await dotenv.load(fileName: '.env');

  // Initialise crash reporting (Firebase Crashlytics + Sentry).
  // [MonitoringService.init] also handles Firebase.initializeApp() and sets
  // up the Flutter / PlatformDispatcher error handlers before runApp is called.
  //
  // The [runApp] callback is invoked by SentryFlutter.init so that Sentry
  // can wrap the widget tree inside its own error-capture zone.
  await MonitoringService.init(
    runApp: () async {
      // Services that depend on Firebase being ready go here.
      ApiClient().initialize();

      // Store a tapped notification locally before navigating to it (#683).
      final pushNotifications = PushNotificationService();
      pushNotifications.tapHandler = NotificationTapCoordinator(
        service: NotificationCenterService.instance,
        navigate: appRouter.go,
      ).handleTap;
      await pushNotifications.init();

      // Flush any offline send drafts as soon as connectivity returns (#678).
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

      final links = AppLinks();
      final initialLink = await links.getInitialLink();
      if (initialLink != null) {
        appRouter.go(deepLinkLocation(initialLink));
      }
      links.uriLinkStream.listen((uri) => appRouter.go(deepLinkLocation(uri)));
      runApp(const IgnitionPayApp());
    },
  );
}
