import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';

import '../../helpers/test_app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AppTheme font consistency', () {
    test('TextTheme styles use Inter with explicit fallbacks', () {
      final theme = AppTheme.light();

      expect(theme.fontFamily, AppTheme.fontFamily);

      for (final style in <TextStyle?>[
        theme.textTheme.bodyLarge,
        theme.textTheme.bodyMedium,
        theme.textTheme.titleLarge,
        theme.textTheme.labelLarge,
        theme.textTheme.headlineMedium,
      ]) {
        expect(style, isNotNull);
        expect(style!.fontFamily, AppTheme.fontFamily);
        expect(style.fontFamilyFallback, AppTheme.fontFamilyFallback);
      }
    });

    test('dark theme mirrors light font family configuration', () {
      final light = AppTheme.light();
      final dark = AppTheme.dark();

      expect(dark.fontFamily, AppTheme.fontFamily);
      expect(
        dark.textTheme.bodyMedium?.fontFamily,
        light.textTheme.bodyMedium?.fontFamily,
      );
      expect(
        dark.textTheme.bodyMedium?.fontFamilyFallback,
        AppTheme.fontFamilyFallback,
      );
    });

    test('fontFamilyFallback is non-empty and documented system faces', () {
      expect(AppTheme.fontFamilyFallback, isNotEmpty);
      expect(AppTheme.fontFamilyFallback.first, 'Roboto');
      expect(AppTheme.fontFamilyFallback, contains('sans-serif'));
    });

    testWidgets('sample text inherits theme font family (not a local override)',
        (tester) async {
      await tester.pumpWidget(
        testApp(
          const Text('Ignition Pay typography sample'),
        ),
      );
      await tester.pump();

      final text = tester.widget<Text>(find.text('Ignition Pay typography sample'));
      // Text has no explicit style — Material DefaultTextStyle / theme applies.
      expect(text.style?.fontFamily, isNull);

      final enriched = DefaultTextStyle.of(
        tester.element(find.text('Ignition Pay typography sample')),
      ).style;
      expect(enriched.fontFamily, AppTheme.fontFamily);
    });

    testWidgets('text scale factor from MediaQuery is respected', (tester) async {
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
          child: testApp(
            Builder(
              builder: (context) {
                final scaler = MediaQuery.textScalerOf(context);
                return Text('scaled', style: Theme.of(context).textTheme.bodyLarge);
              },
            ),
          ),
        ),
      );
      await tester.pump();

      final context = tester.element(find.text('scaled'));
      expect(MediaQuery.textScalerOf(context).scale(10), 15);

      // Theme must not force textScaleFactor: 1.0 via a hard-coded MediaQuery.
      final style = DefaultTextStyle.of(context).style;
      expect(style.fontFamily, AppTheme.fontFamily);
    });

    testWidgets('visual regression: light + dark sample board', (tester) async {
      // Side-by-side board representing Android/iOS parity targets.
      // Goldens: app_theme_fonts_android.png / app_theme_fonts_ios.png can be
      // captured on-device; this widget test locks the layout contract.
      Widget sample(ThemeData theme, String label) {
        return Theme(
          data: theme,
          child: Builder(
            builder: (context) {
              final tt = Theme.of(context).textTheme;
              return ColoredBox(
                color: theme.scaffoldBackgroundColor,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: tt.titleLarge),
                      Text('Body — Inter across platforms', style: tt.bodyMedium),
                      Text('Label / captions', style: tt.labelMedium),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      }

      await tester.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          home: Scaffold(
            body: Row(
              children: [
                Expanded(child: sample(AppTheme.light(), 'Android / light')),
                Expanded(child: sample(AppTheme.dark(), 'iOS / dark')),
              ],
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Android / light'), findsOneWidget);
      expect(find.text('iOS / dark'), findsOneWidget);
      expect(find.text('Body — Inter across platforms'), findsNWidgets(2));

      await expectLater(
        find.byType(Scaffold),
        matchesGoldenFile('goldens/app_theme_fonts_side_by_side.png'),
      );
    }, skip: true); // Enable locally with --update-goldens on Android & iOS.
  });
}
