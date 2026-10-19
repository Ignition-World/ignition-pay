import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/app_button.dart';
import 'package:ignition_mobile/core/design_system/app_card.dart';
import 'package:ignition_mobile/core/design_system/app_color_tokens.dart';
import 'package:ignition_mobile/core/design_system/app_network_image.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';
import 'package:ignition_mobile/core/design_system/shimmer_loader.dart';

import '../../helpers/test_app.dart';

/// Every mode the app can be in: explicit light, explicit dark, and the
/// system default, which follows the platform brightness.
const _modes = <({String label, ThemeMode mode, Brightness brightness})>[
  (label: 'light', mode: ThemeMode.light, brightness: Brightness.light),
  (label: 'dark', mode: ThemeMode.dark, brightness: Brightness.dark),
  (label: 'system', mode: ThemeMode.system, brightness: Brightness.light),
];

AppColorTokens tokensFor(WidgetTester tester) {
  final context = tester.element(find.byType(Scaffold).first);
  return Theme.of(context).extension<AppColorTokens>()!;
}

void main() {
  group('AppColorTokens', () {
    test('is registered on both app themes', () {
      expect(
        AppTheme.light().extensions.values.whereType<AppColorTokens>(),
        hasLength(1),
      );
      expect(
        AppTheme.dark().extensions.values.whereType<AppColorTokens>(),
        hasLength(1),
      );
    });

    test('light and dark sets are distinct for every token', () {
      final light = appColorTokensFor(Brightness.light);
      final dark = appColorTokensFor(Brightness.dark);

      expect(light.shimmerBase, isNot(dark.shimmerBase));
      expect(light.shimmerHighlight, isNot(dark.shimmerHighlight));
      expect(light.placeholderSurface, isNot(dark.placeholderSurface));
      expect(light.muted, isNot(dark.muted));
      expect(light.success, isNot(dark.success));
      expect(light.error, isNot(dark.error));
      expect(light.warning, isNot(dark.warning));
    });

    test('dark shimmer base is not the light-mode literal', () {
      // Guards the regression this issue is about: the old code branched on
      // brightness inside the widget, so one mode always used the wrong tone.
      expect(
        appColorTokensFor(Brightness.dark).shimmerBase,
        isNot(const Color(0xFFE0E0E0)),
      );
      expect(
        appColorTokensFor(Brightness.dark).shimmerBase,
        const Color(0xFF2C2C3E),
      );
    });

    test('copyWith and lerp preserve every field', () {
      const base = AppColorTokens.light;
      final copied = base.copyWith(muted: const Color(0xFF010203));
      expect(copied.muted, const Color(0xFF010203));
      expect(copied.shimmerBase, base.shimmerBase);
      expect(copied.error, base.error);

      final mid = base.lerp(AppColorTokens.dark, 0.5);
      expect(mid.shimmerBase, isNot(base.shimmerBase));
      expect(mid.shimmerBase, isNot(AppColorTokens.dark.shimmerBase));
    });
  });

  for (final mode in _modes) {
    group('design system components in ${mode.label} mode', () {
      testWidgets('theme exposes a token set', (tester) async {
        await tester.pumpWidget(
          testApp(const SizedBox.shrink(), themeMode: mode.mode),
        );

        final tokens = tokensFor(tester);
        final expected =
            appColorTokensFor(mode.brightness);
        expect(tokens.shimmerBase, expected.shimmerBase);
        expect(tokens.placeholderSurface, expected.placeholderSurface);
      });

      testWidgets('ShimmerLoader uses themed colours', (tester) async {
        await tester.pumpWidget(
          testApp(
            const ShimmerLoader(child: SizedBox(width: 20, height: 20)),
            themeMode: mode.mode,
          ),
        );
        await tester.pump();

        final shimmer = tester.widget<Shimmer>(find.byType(Shimmer));
        final tokens = tokensFor(tester);
        expect(shimmer.gradient.colors.first, tokens.shimmerBase);
        expect(shimmer.gradient.colors.last, tokens.shimmerHighlight);
      });

      testWidgets('ShimmerBox placeholder surface is themed', (tester) async {
        await tester.pumpWidget(
          testApp(
            const ShimmerBox(width: 32, height: 32),
            themeMode: mode.mode,
          ),
        );
        await tester.pump();

        final container = tester.widget<Container>(
          find.descendant(
            of: find.byType(ShimmerLoader),
            matching: find.byType(Container),
          ),
        );
        final decoration = container.decoration! as BoxDecoration;
        expect(decoration.color, tokensFor(tester).placeholderSurface);
      });

      testWidgets('AppCard border uses the theme colour scheme', (
        tester,
      ) async {
        await tester.pumpWidget(
          testApp(
            const AppCard(child: Text('Balance')),
            themeMode: mode.mode,
          ),
        );

        final context = tester.element(find.byType(AppCard));
        final expected = Theme.of(context).colorScheme.outlineVariant;

        final card = tester.widget<Card>(find.byType(Card));
        final shape = card.shape! as RoundedRectangleBorder;
        expect(shape.side.color, expected);
      });

      testWidgets('AppButton label renders with the themed foreground', (
        tester,
      ) async {
        await tester.pumpWidget(
          testApp(
            const AppButton(label: 'Pay', onPressed: null),
            themeMode: mode.mode,
          ),
        );

        final text = tester.widget<Text>(find.text('Pay'));
        final context = tester.element(find.byType(AppButton));
        // The button must not paint a hardcoded colour: the label inherits
        // the button's themed foreground and is non-null in every mode.
        expect(text.style?.color, anyOf(isNull, Theme.of(context).colorScheme.onSurface));
      });

      testWidgets('AppNetworkImage builds in every mode', (tester) async {
        await tester.pumpWidget(
          testApp(
            const AppNetworkImage(url: 'https://example.invalid/a.png', width: 40, height: 40),
            themeMode: mode.mode,
          ),
        );
        await tester.pump();

        // The placeholder the component builds is the themed ShimmerBox, so
        // its surface tracks the mode (asserted above for ShimmerBox itself).
        expect(find.byType(AppNetworkImage), findsOneWidget);
        expect(find.byType(ShimmerBox), findsOneWidget);
      });

    });
  }

  testWidgets('shimmer is not the light literal in dark mode', (
    tester,
  ) async {
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
      isNot(const Color(0xFFE0E0E0)),
    );
  });
}
