import 'package:drift/drift.dart' show QueryExecutor;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:ignition_mobile/core/design_system/error_state_view.dart';
import 'package:ignition_mobile/core/network/api_exception.dart';
import 'package:ignition_mobile/features/home/pages/home_page.dart';

import '../../helpers/test_app.dart';
import '../../helpers/pump_helpers.dart';

/// Builds a [HomePage] wired to [fetchFn] and backed by an in-memory Drift
/// database so no disk I/O is needed during tests.
///
/// The widget is wrapped in a [GoRouter] so that [context.go('/login')] works
/// when an [UnauthorizedException] is received.
GoRouter _router({
  required Future<Map<String, dynamic>> Function() fetchFn,
  QueryExecutor? executor,
}) {
  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => HomePage(
          walletAddress: 'test-wallet',
          fetchBalances: fetchFn,
        ),
      ),
      GoRoute(
        path: '/login',
        builder: (_, __) => const Scaffold(
          body: Center(child: Text('Login screen')),
        ),
      ),
    ],
  );
}

void main() {
  group('HomePage — error states', () {
    testWidgets('shows no-connection error state on NoConnectionException',
        (tester) async {
      final router = _router(
        fetchFn: () async => throw const NoConnectionException(),
      );

      await tester.pumpAppWithRouter(router);

      expect(find.byType(ErrorStateView), findsOneWidget);
      expect(
        find.text('No connection. Check your internet and try again.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('error_retry_button')), findsOneWidget);
    });

    testWidgets('shows server error state on ServerException', (tester) async {
      final router = _router(
        fetchFn: () async => throw const ServerException(),
      );

      await tester.pumpAppWithRouter(router);

      expect(find.byType(ErrorStateView), findsOneWidget);
      expect(
        find.text('Server error. Something went wrong on our end — please try again.'),
        findsOneWidget,
      );
    });

    testWidgets('shows slow-connection error state on SlowConnectionException',
        (tester) async {
      final router = _router(
        fetchFn: () async => throw const SlowConnectionException(),
      );

      await tester.pumpAppWithRouter(router);

      expect(find.byType(ErrorStateView), findsOneWidget);
      expect(
        find.text(
            'Slow connection. The request took too long — please try again.'),
        findsOneWidget,
      );
    });

    testWidgets('retry button triggers another fetch', (tester) async {
      var callCount = 0;
      final router = _router(
        fetchFn: () async {
          callCount++;
          throw const ServerException();
        },
      );

      await tester.pumpAppWithRouter(router);
      // First load triggered from initState.
      expect(callCount, 1);

      await tester.tap(find.byKey(const Key('error_retry_button')));
      await tester.pumpAndSettle();

      expect(callCount, 2);
    });

    testWidgets('retry button shows spinner during retry fetch', (tester) async {
      // Hold the completer so we can inspect the intermediate loading state.
      final completer = Future<Map<String, dynamic>>.delayed(
        const Duration(milliseconds: 200),
        () => throw const ServerException(),
      );

      var first = true;
      final router = _router(
        fetchFn: () async {
          if (first) {
            first = false;
            throw const ServerException();
          }
          return completer;
        },
      );

      await tester.pumpAppWithRouter(router);
      // Error state is visible.
      expect(find.byKey(const Key('error_retry_button')), findsOneWidget);

      // Tap retry — don't settle yet.
      await tester.tap(find.byKey(const Key('error_retry_button')));
      await tester.pump(); // Start the async call.
      await tester.pump(const Duration(milliseconds: 50)); // Mid-flight.

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.pumpAndSettle();
    });

    testWidgets('401 redirects to /login — no retry button shown',
        (tester) async {
      final router = _router(
        fetchFn: () async => throw const UnauthorizedException(),
      );

      await tester.pumpAppWithRouter(router);

      // Should have navigated away from HomePage to the login screen.
      expect(find.text('Login screen'), findsOneWidget);
      expect(find.byType(ErrorStateView), findsNothing);
      expect(find.byKey(const Key('error_retry_button')), findsNothing);
    });

    testWidgets('no raw exception messages leaked to the UI', (tester) async {
      final router = _router(
        fetchFn: () async => throw const NoConnectionException(),
      );

      await tester.pumpAppWithRouter(router);

      // Raw Dio/exception internals must not appear in the widget tree.
      expect(find.textContaining('DioException'), findsNothing);
      expect(find.textContaining('SocketException'), findsNothing);
      expect(find.textContaining('Exception:'), findsNothing);
    });

    testWidgets('successful fetch shows balance data, no error state',
        (tester) async {
      final router = _router(
        fetchFn: () async => {'XLM': 100.0, 'USDC': 50.0},
      );

      await tester.pumpAppWithRouter(router);

      expect(find.byType(ErrorStateView), findsNothing);
      expect(find.text('XLM'), findsOneWidget);
      expect(find.text('USDC'), findsOneWidget);
    });
  });
}
