import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/features/receive/copy_address_button.dart';

import '../../test_utils.dart';

void main() {
  late MockHapticService haptics;

  setUp(() {
    haptics = MockHapticService();
    stubHapticsNoOp(haptics);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  testWidgets('fires a light haptic when the address is copied',
      (tester) async {
    await tester.pumpWidget(
      testApp(
        const CopyAddressButton(
          address: 'GABCD123',
          hapticService: null,
        ),
      ),
    );

    await tester.tap(find.text('Copy address'));
    await tester.pump();

    expect(find.text('Copied'), findsOneWidget);
  });

  testWidgets('uses the injected HapticService for the copy cue',
      (tester) async {
    await tester.pumpWidget(
      testApp(CopyAddressButton(address: 'GABCD123', hapticService: haptics)),
    );

    await tester.tap(find.text('Copy address'));
    await tester.pump();

    verify(() => haptics.lightImpact()).called(1);
  });
}
