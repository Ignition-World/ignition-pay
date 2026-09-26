import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';

/// Wraps [child] in a bare [MaterialApp] using the app's light theme.
///
/// Suitable for unit-testing individual widgets that don't need routing.
Widget testApp(Widget child, {ThemeData? theme, ThemeMode themeMode = ThemeMode.light}) {
  return MaterialApp(
    theme: theme ?? AppTheme.light(),
    darkTheme: AppTheme.dark(),
    themeMode: themeMode,
    debugShowCheckedModeBanner: false,
    home: Scaffold(body: child),
  );
}

/// Wraps [child] in a [MaterialApp.router] backed by [router].
///
/// Use when the widget under test navigates via [GoRouter] (e.g. calls
/// `context.go(...)` or reads `GoRouterState`).
Widget testAppWithRouter(GoRouter router) {
  return MaterialApp.router(
    theme: AppTheme.light(),
    darkTheme: AppTheme.dark(),
    debugShowCheckedModeBanner: false,
    routerConfig: router,
  );
}

/// Builds a minimal [GoRouter] that renders [child] at `/`.
///
/// Useful when the widget under test just needs a router present in the tree
/// but does not actually navigate anywhere.
GoRouter testRouter(Widget child) {
  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(body: child),
      ),
    ],
  );
}
