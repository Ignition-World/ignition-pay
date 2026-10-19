import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'helpers/test_helpers.dart';

void main() {
  testWidgets('test helpers can pump a simple widget', (tester) async {
    await tester.pumpApp(const Text('Hello Ignition'));

    expect(find.text('Hello Ignition'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
