import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/core/design_system/app_error_banner.dart';

import '../../test_utils.dart';

void main() {
  late MockHapticService haptics;

  setUp(() {
    haptics = MockHapticService();
    stubHapticsNoOp(haptics);
  });

  testWidgets('fires a heavy haptic when an error state appears',
      (tester) async {
    await tester.pumpWidget(
      testApp(const AppErrorBanner(message: 'Transaction failed')),
    );
    await tester.pump();

    expect(find.text('Transaction failed'), findsOneWidget);
  });

  testWidgets('uses the injected HapticService and fires only once',
      (tester) async {
    await tester.pumpWidget(
      testApp(AppErrorBanner(message: 'Transaction failed', hapticService: haptics)),
    );
    await tester.pump();
    await tester.pump();

    verify(() => haptics.heavyImpact()).called(1);
  });
}
