import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'app.dart';
import 'core/bootstrap/app_bootstrap.dart';
import 'core/bootstrap/splash_app.dart';

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
  );
}
