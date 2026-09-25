import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shimmer/shimmer.dart';

import 'package:ignition_mobile/core/design_system/app_color_tokens.dart';
import 'package:ignition_mobile/core/design_system/shimmer_loader.dart';

import '../../helpers/test_app.dart';

void main() {
  group('ShimmerLoader', () {
    testWidgets('wraps child in Shimmer when enabled', (tester) async {
      await tester.pumpWidget(
        testApp(
          const ShimmerLoader(
            child: SizedBox(width: 40, height: 12, child: Text('loading')),
          ),
        ),
      );
      // Advance one frame only — shimmer animates forever.
      await tester.pump();

      expect(find.byType(Shimmer), findsOneWidget);
      expect(find.text('loading'), findsOneWidget);
    });

    testWidgets('returns child directly when disabled', (tester) async {
      await tester.pumpWidget(
        testApp(
          const ShimmerLoader(
            enabled: false,
            child: Text('ready'),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(Shimmer), findsNothing);
      expect(find.text('ready'), findsOneWidget);
    });

    testWidgets('uses dark base colors under dark theme', (tester) async {
      await tester.pumpWidget(
        testApp(
          const ShimmerLoader(child: SizedBox(width: 20, height: 20)),
          themeMode: ThemeMode.dark,
        ),
      );
      await tester.pump();

      final shimmer = tester.widget<Shimmer>(find.byType(Shimmer));
      expect(
        shimmer.gradient.colors.first,
        appColorTokensFor(Brightness.dark).shimmerBase,
      );
      expect(shimmer.gradient.colors.first, isNot(const Color(0xFFE0E0E0)));
    });
  });

  group('ShimmerBox', () {
    testWidgets('renders a sized shimmer placeholder', (tester) async {
      await tester.pumpWidget(
        testApp(
          const ShimmerBox(width: 64, height: 48, borderRadius: 12),
        ),
      );
      await tester.pump();

      expect(find.byType(ShimmerLoader), findsOneWidget);
      expect(find.byType(Shimmer), findsOneWidget);

      final box = tester.widget<Container>(
        find.descendant(
          of: find.byType(ShimmerLoader),
          matching: find.byType(Container),
        ),
      );
      expect(
        box.constraints,
        BoxConstraints.tightFor(width: 64, height: 48),
      );
      final decoration = box.decoration! as BoxDecoration;
      expect(decoration.borderRadius, BorderRadius.circular(12));
    });
  });
}
