import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/error_state_view.dart';
import 'package:ignition_mobile/core/network/api_exception.dart';

import '../../helpers/test_app.dart';

void main() {
  group('ErrorStateView', () {
    testWidgets('shows no-connection message and retry button', (tester) async {
      var retried = false;

      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const NoConnectionException(),
            onRetry: () => retried = true,
          ),
        ),
      );

      expect(find.text('No connection. Check your internet and try again.'), findsOneWidget);
      expect(find.byKey(const Key('error_retry_button')), findsOneWidget);
      expect(find.byIcon(Icons.signal_wifi_off_outlined), findsOneWidget);

      await tester.tap(find.byKey(const Key('error_retry_button')));
      await tester.pump();
      expect(retried, isTrue);
    });

    testWidgets('shows slow-connection message and retry button', (tester) async {
      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const SlowConnectionException(),
            onRetry: () {},
          ),
        ),
      );

      expect(
        find.text('Slow connection. The request took too long — please try again.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('error_retry_button')), findsOneWidget);
    });

    testWidgets('shows server error message and retry button', (tester) async {
      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const ServerException(),
            onRetry: () {},
          ),
        ),
      );

      expect(
        find.text('Server error. Something went wrong on our end — please try again.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('error_retry_button')), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_outlined), findsOneWidget);
    });

    testWidgets('UnauthorizedException hides retry button', (tester) async {
      await tester.pumpWidget(
        testApp(
          const ErrorStateView(
            error: UnauthorizedException(),
            onRetry: null, // explicitly no retry for 401
          ),
        ),
      );

      expect(find.text('Your session has expired. Please sign in again.'), findsOneWidget);
      expect(find.byKey(const Key('error_retry_button')), findsNothing);
      expect(find.byIcon(Icons.lock_outline), findsOneWidget);
    });

    testWidgets('retry button shows spinner while retrying', (tester) async {
      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const ServerException(),
            retrying: true,
            onRetry: () {},
          ),
        ),
      );

      // AppButton shows CircularProgressIndicator when loading = true.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      // Label hidden during loading.
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('retry button is disabled while retrying', (tester) async {
      var callCount = 0;

      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const ServerException(),
            retrying: true,
            onRetry: () => callCount++,
          ),
        ),
      );

      await tester.tap(
        find.byKey(const Key('error_retry_button')),
        warnIfMissed: false,
      );
      await tester.pump();
      expect(callCount, 0);
    });

    testWidgets('UnexpectedApiException shows generic error icon', (tester) async {
      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const UnexpectedApiException(),
            onRetry: () {},
          ),
        ),
      );

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('renders correctly under dark theme', (tester) async {
      await tester.pumpWidget(
        testApp(
          ErrorStateView(
            error: const NoConnectionException(),
            onRetry: () {},
          ),
          themeMode: ThemeMode.dark,
        ),
      );

      expect(find.byKey(const Key('error_retry_button')), findsOneWidget);
    });
  });
}
