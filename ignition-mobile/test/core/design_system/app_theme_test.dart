import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/app_colors.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';

import '../../helpers/test_app.dart';

void main() {
  group('AppTheme', () {
    test('light() returns Material 3 light ThemeData seeded by primary', () {
      final theme = AppTheme.light();

      expect(theme.brightness, Brightness.light);
      expect(theme.useMaterial3, isTrue);
      expect(theme.scaffoldBackgroundColor, AppColors.surface);
      expect(theme.colorScheme.brightness, Brightness.light);
    });

    test('dark() returns Material 3 dark ThemeData with dark surface', () {
      final theme = AppTheme.dark();

      expect(theme.brightness, Brightness.dark);
      expect(theme.useMaterial3, isTrue);
      expect(theme.scaffoldBackgroundColor, AppColors.surfaceDark);
      expect(theme.colorScheme.brightness, Brightness.dark);
    });

    testWidgets('light theme applies through MaterialApp shell', (tester) async {
      late Brightness brightness;

      await tester.pumpWidget(
        testApp(
          Builder(
            builder: (context) {
              brightness = Theme.of(context).brightness;
              return const Text('light-shell');
            },
          ),
          themeMode: ThemeMode.light,
        ),
      );

      expect(find.text('light-shell'), findsOneWidget);
      expect(brightness, Brightness.light);
    });

    testWidgets('dark theme applies through MaterialApp shell', (tester) async {
      late Brightness brightness;

      await tester.pumpWidget(
        testApp(
          Builder(
            builder: (context) {
              brightness = Theme.of(context).brightness;
              return const Text('dark-shell');
            },
          ),
          themeMode: ThemeMode.dark,
        ),
      );

      expect(find.text('dark-shell'), findsOneWidget);
      expect(brightness, Brightness.dark);
    });
  });
}
