import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/core/design_system/haptic_switch.dart';

import '../../test_utils.dart';

void main() {
  late MockHapticService haptics;

  setUp(() {
    haptics = MockHapticService();
    stubHapticsNoOp(haptics);
  });

  testWidgets('fires a light haptic when toggled on', (tester) async {
    var value = false;

    await tester.pumpWidget(
      testApp(
        StatefulBuilder(
          builder: (context, setState) => HapticSwitch(
            value: value,
            onChanged: (next) {
              value = next;
              setState(() {});
            },
            hapticService: haptics,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(Switch));
    await tester.pump();

    verify(() => haptics.lightImpact()).called(1);
    expect(value, isTrue);
  });

  testWidgets('does not fire when disabled', (tester) async {
    await tester.pumpWidget(
      testApp(
        const HapticSwitch(
          value: false,
          onChanged: null,
          hapticService: null,
        ),
      ),
    );

    await tester.tap(find.byType(Switch));
    await tester.pump();

    verifyNever(() => haptics.lightImpact());
  });
}
