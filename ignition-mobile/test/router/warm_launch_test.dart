import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ignition_mobile/core/routing/deep_link.dart';
import 'package:ignition_mobile/core/routing/route_restoration_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Warm-launch tests for #698.
///
/// These mirror the production wiring — `RouteRestorationService.warmUp()`
/// before the router is built, and the router's `initialLocation` taken from
/// the service — without importing `app_router.dart`, whose route builders
/// pull in feature pages that are out of scope here.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const sendLocation = '/send';
  const receiveLocation = '/receive';

  GoRouter buildRouter(String initialLocation) {
    return GoRouter(
      initialLocation: initialLocation,
      routes: <RouteBase>[
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('Home screen')),
        ),
        GoRoute(
          path: '/send',
          builder: (_, __) => const Scaffold(body: Text('Send screen')),
        ),
        GoRoute(
          path: '/receive',
          builder: (_, __) => const Scaffold(body: Text('Receive screen')),
        ),
        GoRoute(
          path: '/login',
          builder: (_, __) => const Scaffold(body: Text('Sign in screen')),
        ),
        GoRoute(
          path: '/pay/:address',
          builder: (_, state) => Scaffold(
            body: Text('Pay ${state.pathParameters['address']}'),
          ),
        ),
      ],
    );
  }

  Future<String> warmLaunch(
    WidgetTester tester, {
    required bool isAuthenticated,
    String? deepLink,
  }) async {
    final restoration = RouteRestorationService();
    await restoration.warmUp(isAuthenticated: isAuthenticated);

    // Production: `appRouter` reads the restored route when it is created.
    final router = buildRouter(restoration.initialLocation ?? '/');
    restoration.attachTo(router);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    // A cold-start deep link arrives after the app is mounted and must win.
    if (deepLink != null) {
      router.go(DeepLinkResolver.locationFor(Uri.parse(deepLink)));
      await tester.pumpAndSettle();
    }

    return router.state.uri.toString();
  }

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    RouteRestorationService.instance = RouteRestorationService();
  });

  testWidgets('a first launch lands on home', (tester) async {
    final location = await warmLaunch(tester, isAuthenticated: true);

    expect(find.text('Home screen'), findsOneWidget);
    expect(location, '/');
  });

  testWidgets('a warm launch reopens the send screen', (tester) async {
    final service = RouteRestorationService();
    await service.record(sendLocation);

    final location = await warmLaunch(tester, isAuthenticated: true);

    expect(find.text('Send screen'), findsOneWidget);
    expect(find.text('Home screen'), findsNothing);
    expect(location, sendLocation);
  });

  testWidgets('a warm launch reopens the receive screen', (tester) async {
    final service = RouteRestorationService();
    await service.record(receiveLocation);

    final location = await warmLaunch(tester, isAuthenticated: true);

    expect(find.text('Receive screen'), findsOneWidget);
    expect(location, receiveLocation);
  });

  testWidgets('a signed-out user is sent to sign-in instead of send',
      (tester) async {
    final service = RouteRestorationService();
    await service.record(sendLocation);

    final location = await warmLaunch(tester, isAuthenticated: false);

    expect(find.text('Sign in screen'), findsOneWidget);
    expect(location, '/login');
  });

  testWidgets('a deep link wins over the restored route', (tester) async {
    final service = RouteRestorationService();
    await service.record(receiveLocation);

    final location = await warmLaunch(
      tester,
      isAuthenticated: true,
      deepLink: 'ignitionpay://pay/GABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
    );

    expect(find.textContaining('Pay GABCDEFG'), findsOneWidget);
    expect(find.text('Receive screen'), findsNothing);
    expect(location, contains('/pay/'));
  });

  testWidgets('navigations are recorded for the next warm launch',
      (tester) async {
    final restoration = RouteRestorationService();
    await restoration.warmUp(isAuthenticated: true);
    final router = buildRouter(restoration.initialLocation ?? '/');
    restoration.attachTo(router);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Home screen'));
    router.go(receiveLocation);
    await tester.pumpAndSettle();

    final nextLaunch = RouteRestorationService();
    await nextLaunch.warmUp(isAuthenticated: true);

    expect(nextLaunch.initialLocation, receiveLocation);
  });
}
