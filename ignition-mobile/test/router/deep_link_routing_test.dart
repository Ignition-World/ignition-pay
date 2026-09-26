import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:ignition_mobile/core/routing/deep_link.dart';
import 'package:ignition_mobile/features/send/payment_review_page.dart';

void main() {
  final account = 'G${'A' * 55}';

  GoRouter buildRouter() => GoRouter(
        initialLocation: '/',
        routes: <RouteBase>[
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(body: Text('Home')),
          ),
          GoRoute(
            path: '/pay/:address',
            builder: (context, state) {
              return PaymentReviewPage(
                initialAddress: state.pathParameters['address']!,
                initialAmount: state.uri.queryParameters['amount'],
                initialAsset: state.uri.queryParameters['asset'] ?? 'XLM',
                initialMemo: state.uri.queryParameters['memo'],
              );
            },
          ),
        ],
      );

  Future<void> openLink(
    WidgetTester tester,
    GoRouter router,
    String link,
  ) async {
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    // Mirrors main.dart: resolve the inbound URI, then navigate.
    router.go(DeepLinkResolver.locationFor(Uri.parse(link)));
    await tester.pumpAndSettle();
  }

  String fieldText(WidgetTester tester, Key key) {
    final editable = find.descendant(
      of: find.byKey(key),
      matching: find.byType(EditableText),
    );
    return tester.widget<EditableText>(editable).controller.text;
  }

  testWidgets('ignitionpay:// deep link opens /pay with parsed parameters',
      (tester) async {
    await openLink(
      tester,
      buildRouter(),
      'ignitionpay://pay/$account?amount=10&asset=USDC&memo=hi',
    );

    expect(find.byType(PaymentReviewPage), findsOneWidget);
    expect(fieldText(tester, const Key('recipient_field')), account);
    expect(fieldText(tester, const Key('amount_field')), '10');
    expect(fieldText(tester, const Key('asset_field')), 'USDC');
    expect(fieldText(tester, const Key('memo_field')), 'hi');
  });

  testWidgets('https universal link opens the same route', (tester) async {
    await openLink(
      tester,
      buildRouter(),
      'https://ignitionpay.com/pay/$account?amount=42.5&asset=XLM',
    );

    expect(find.byType(PaymentReviewPage), findsOneWidget);
    expect(fieldText(tester, const Key('recipient_field')), account);
    expect(fieldText(tester, const Key('amount_field')), '42.5');
    expect(fieldText(tester, const Key('asset_field')), 'XLM');
  });

  testWidgets('an invalid deep link falls back to the home page',
      (tester) async {
    await openLink(tester, buildRouter(), 'ignitionpay://bogus');

    expect(find.text('Home'), findsOneWidget);
    expect(find.byType(PaymentReviewPage), findsNothing);
  });
}
