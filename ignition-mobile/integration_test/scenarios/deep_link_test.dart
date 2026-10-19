// Critical flow: deep-link routing.
//
// What this test guards:
//   * `ignitionpay://pay/<address>?amount=X&asset=Y&memo=Z` lands on the
//     placeholder pay screen with all parameters parsed out by GoRouter.
//   * `https://ignitionpay.com/pay/<address>?...` does the same.
//   * Variant deep links (`/send`, `/receive`) navigate to the right
//     placeholder screen.
//
// In production the `app_links` plugin delivers these URIs to the Dart side
// via its MethodChannel receiver; the receiver then forwards them to
// GoRouter. Until that receiver is wired into main.dart, the most truthful
// end-to-end assertion we can make is that the *GoRouter* layer (which the
// real receiver will eventually call) handles the deep-link-shaped URIs
// correctly. Once the app_links receiver is added to main.dart, the test
// should be extended to drive the platform channel directly — see the
// `// FUTURE: platform channel` comment below for the off-by-default variant.

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

  Future<void> simulateDeepLink(WidgetTester tester, String uri) async {
    // FUTURE: platform channel. Once the app_links receiver is exercised on a
    // device, replace this with a
    // `binding.defaultBinaryMessenger.handlePlatformMessage` call for
    // `com.llfbandit.app_links/messages` carrying a MethodCall `onAppLink(uri)`.
    // Until then, drive GoRouter with the exact production resolver that
    // main.dart uses.
    app_routes.appRouter.go(app_routes.deepLinkLocation(Uri.parse(uri)));
    await tester.pumpAndSettle();
  }

  testWidgets('ignitionpay://pay deep link routes to /pay/:address with parsed params',
      (tester) async {
    await bootApp(tester);

    await simulateDeepLink(
      tester,
      'ignitionpay://pay/GABCD1234567?amount=10&asset=USDC&memo=hello',
    );

    expect(find.textContaining('Pay to: GABCD1234567'), findsOneWidget);
    expect(find.textContaining('Amount: 10 USDC'), findsOneWidget);
    expect(find.textContaining('Memo: hello'), findsOneWidget);
  });

  testWidgets('https://ignitionpay.com/pay deep link routes identically',
      (tester) async {
    await bootApp(tester);

    await simulateDeepLink(
      tester,
      'https://ignitionpay.com/pay/GXYZ987?amount=42.5&asset=XLM',
    );

    expect(find.textContaining('Pay to: GXYZ987'), findsOneWidget);
    expect(find.textContaining('Amount: 42.5 XLM'), findsOneWidget);
  });

  testWidgets('/send and /receive deep links route to placeholder screens',
      (tester) async {
    await bootApp(tester);

    await simulateDeepLink(tester, 'ignitionpay://send');
    expect(find.text('Send Screen'), findsOneWidget);

    await simulateDeepLink(tester, 'ignitionpay://receive');
    expect(find.text('Receive Screen'), findsOneWidget);
  });
}
