import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../test_utils.dart';

void main() {
  group('pumpApp helper', () {
    testWidgets('renders widget inside MaterialApp', (tester) async {
      await tester.pumpApp(const Text('Hello, Ignition!'));

      expect(find.text('Hello, Ignition!'), findsOneWidget);
    });

    testWidgets('applies light theme by default', (tester) async {
      await tester.pumpApp(Builder(
        builder: (context) => Text(
          Theme.of(context).brightness == Brightness.light ? 'light' : 'dark',
        ),
      ));

      expect(find.text('light'), findsOneWidget);
    });

    testWidgets('accepts a custom theme', (tester) async {
      final customTheme = ThemeData(primaryColor: Colors.red);

      await tester.pumpApp(
        Builder(
          builder: (context) =>
              Text(Theme.of(context).primaryColor == Colors.red ? 'red' : 'other'),
        ),
        theme: customTheme,
      );

      expect(find.text('red'), findsOneWidget);
    });
  });

  group('tapAndSettle helper', () {
    testWidgets('taps a button and settles animations', (tester) async {
      var tapped = false;

      await tester.pumpApp(
        ElevatedButton(
          onPressed: () => tapped = true,
          child: const Text('Tap me'),
        ),
      );

      await tester.tap(find.text('Tap me'));
      await tester.pumpAndSettle();

      expect(tapped, isTrue);
    });
  });

  group('enterTextAndSettle helper', () {
    testWidgets('enters text into a TextField and settles', (tester) async {
      String value = '';

      await tester.pumpApp(
        TextField(onChanged: (v) => value = v),
      );

      await tester.enterTextAndSettle(find.byType(TextField), 'ignition@pay.com');

      expect(value, 'ignition@pay.com');
    });
  });

  group('testRouter', () {
    testWidgets('renders child widget at root route', (tester) async {
      await tester.pumpAppWithTestRouter(const Text('Router works'));

      expect(find.text('Router works'), findsOneWidget);
    });
  });
}
