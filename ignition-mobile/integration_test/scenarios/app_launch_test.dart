// Critical flow: cold launch + GoRouter 404 handling.
//
// What this test guards:
//   * The boot path in `lib/main.dart` produces a MaterialApp.router.
//   * `/` resolves to HomePage (asserting the welcome copy is visible).
//   * GoRouter's `errorBuilder` is wired and shows the "Page Not Found" UI.
//   * Tapping the "Go Home" button restores `/` and the home copy is visible.
//   * Each top-level route declared in `router/app_router.dart` renders a
//     Scaffold without throwing.
//
// Notes:
//   * We do NOT trigger `main()` (which fires Firebase + PushNotification init
//     that can't run in a flutter test VM without platform channels). Instead
//     we pump [IgnitionPayApp], which is what `main()` ultimately renders.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/app.dart';
import 'package:ignition_mobile/router/app_router.dart' as app_routes;

import '../setup/test_bindings.dart';

void main() {
  ensureIntegrationBinding();

  Future<void> bootApp(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const IgnitionPayApp());
    await tester.pumpAndSettle();
  }

  testWidgets('App boots to home page with welcome copy', (tester) async {
    await bootApp(tester);

    expect(find.text('Ignition Pay'), findsOneWidget); // AppBar title
    expect(find.text('Welcome to Ignition Pay'), findsOneWidget);
  });

  testWidgets('Unknown route triggers errorBuilder with "Go Home" CTA',
      (tester) async {
    await bootApp(tester);

    app_routes.appRouter.go('/this-route-does-not-exist');
    await tester.pumpAndSettle();

    expect(find.text('Page Not Found'), findsOneWidget);
    expect(find.textContaining('No route for:'), findsOneWidget);

    final goHome = find.widgetWithText(ElevatedButton, 'Go Home');
    expect(goHome, findsOneWidget);
    await tester.tap(goHome);
    await tester.pumpAndSettle();

    expect(find.text('Welcome to Ignition Pay'), findsOneWidget);
    expect(find.text('Page Not Found'), findsNothing);
  });

  testWidgets('Declared routes render a Scaffold without exceptions',
      (tester) async {
    await bootApp(tester);

    final dryRun = [
      '/',
      '/send',
      '/receive',
      '/pay/GABCD123?amount=10&asset=USDC&memo=hi',
      '/transaction/abc-123',
    ];
    for (final path in dryRun) {
      app_routes.appRouter.go(path);
      await tester.pumpAndSettle();
      expect(find.byType(Scaffold), findsWidgets,
          reason: 'Path $path should produce at least one Scaffold.');
    }
  });
}
