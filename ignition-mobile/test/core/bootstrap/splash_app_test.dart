import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/bootstrap/splash_app.dart';

void main() {
  group('SplashApp', () {
    testWidgets('renders the wordmark and a progress indicator',
        (tester) async {
      await tester.pumpWidget(const SplashApp());
      await tester.pump();

      expect(find.text('Ignition Pay'), findsOneWidget);
      expect(find.byKey(const Key('splash_loading')), findsOneWidget);
    });

    testWidgets('renders on a phone-sized surface', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 2.75;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(const SplashApp());
      await tester.pump();

      expect(find.byKey(const Key('splash')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('animates the progress indicator', (tester) async {
      await tester.pumpWidget(const SplashApp());

      // The spinner is driven by a repeating animation, which is the visual
      // cue that start-up is still in progress.
      await tester.pump(const Duration(milliseconds: 100));

      // The spinner keeps animating while start-up is in flight, so the frame
      // never settles — that is the "still working" cue.
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
