import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/app_card.dart';

import '../../helpers/test_app.dart';

void main() {
  group('AppCard', () {
    testWidgets('renders child content inside a Card', (tester) async {
      await tester.pumpWidget(
        testApp(
          const AppCard(child: Text('Balance')),
        ),
      );

      expect(find.text('Balance'), findsOneWidget);
      expect(find.byType(Card), findsOneWidget);
      expect(find.byType(InkWell), findsOneWidget);
    });

    testWidgets('invokes onTap when the card is tapped', (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        testApp(
          AppCard(
            onTap: () => tapped = true,
            child: const Text('Tap me'),
          ),
        ),
      );

      await tester.tap(find.byType(AppCard));
      await tester.pump();
      expect(tapped, isTrue);
    });

    testWidgets('applies custom padding', (tester) async {
      const padding = EdgeInsets.all(32);

      await tester.pumpWidget(
        testApp(
          const AppCard(
            padding: padding,
            child: Text('Padded'),
          ),
        ),
      );

      final pad = tester.widget<Padding>(
        find.descendant(
          of: find.byType(InkWell),
          matching: find.byType(Padding),
        ),
      );
      expect(pad.padding, padding);
    });

    testWidgets('renders under dark theme with outline side', (tester) async {
      await tester.pumpWidget(
        testApp(
          const AppCard(child: Text('Dark card')),
          themeMode: ThemeMode.dark,
        ),
      );

      final card = tester.widget<Card>(find.byType(Card));
      final shape = card.shape! as RoundedRectangleBorder;
      expect(shape.side.color, isNot(equals(Colors.transparent)));
      expect(find.text('Dark card'), findsOneWidget);
    });
  });
}
