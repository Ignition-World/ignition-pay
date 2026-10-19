import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/design_system/app_button.dart';

import '../../helpers/test_app.dart';

void main() {
  group('AppButton', () {
    testWidgets('renders primary label and invokes onPressed on tap',
        (tester) async {
      // Arrange
      var tapped = false;

      // Act
      await tester.pumpWidget(
        testApp(
          AppButton(
            label: 'Continue',
            onPressed: () => tapped = true,
          ),
        ),
      );

      // Assert
      expect(find.text('Continue'), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);

      await tester.tap(find.byType(AppButton));
      await tester.pump();
      expect(tapped, isTrue);
    });

    testWidgets('renders secondary and text variants', (tester) async {
      await tester.pumpWidget(
        testApp(
          const Column(
            children: [
              AppButton(
                label: 'Secondary',
                onPressed: null,
                variant: AppButtonVariant.secondary,
              ),
              AppButton(
                label: 'Textual',
                onPressed: null,
                variant: AppButtonVariant.text,
              ),
            ],
          ),
        ),
      );

      expect(find.byType(OutlinedButton), findsOneWidget);
      expect(find.byType(TextButton), findsOneWidget);
      expect(find.text('Secondary'), findsOneWidget);
      expect(find.text('Textual'), findsOneWidget);
    });

    testWidgets('shows loading spinner and disables presses', (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        testApp(
          AppButton(
            label: 'Pay',
            loading: true,
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Pay'), findsNothing);

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);

      await tester.tap(find.byType(FilledButton), warnIfMissed: false);
      await tester.pump();
      expect(tapped, isFalse);
    });

    testWidgets('renders icon beside label when provided', (tester) async {
      await tester.pumpWidget(
        testApp(
          AppButton(
            label: 'Send',
            icon: const Icon(Icons.send),
            onPressed: () {},
          ),
        ),
      );

      expect(find.byIcon(Icons.send), findsOneWidget);
      expect(find.text('Send'), findsOneWidget);
    });

    testWidgets('renders under dark theme without throwing', (tester) async {
      await tester.pumpWidget(
        testApp(
          AppButton(label: 'Dark', onPressed: () {}),
          themeMode: ThemeMode.dark,
        ),
      );

      expect(find.text('Dark'), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);
    });
  });
}
