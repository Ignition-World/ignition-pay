import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/core/design_system/haptic_tab_bar.dart';

import '../../test_utils.dart';

void main() {
  late MockHapticService haptics;

  setUp(() {
    haptics = MockHapticService();
    stubHapticsNoOp(haptics);
  });

  testWidgets('fires a light haptic when a tab is selected', (tester) async {
    int? tappedIndex;

    await tester.pumpWidget(
      testApp(
        DefaultTabController(
          length: 2,
          child: Scaffold(
            appBar: HapticTabBar(
              tabs: const [Tab(text: 'Assets'), Tab(text: 'Activity')],
              onTap: (index) => tappedIndex = index,
              hapticService: haptics,
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Activity'));
    await tester.pump();

    verify(() => haptics.lightImpact()).called(1);
    expect(tappedIndex, 1);
  });
}
