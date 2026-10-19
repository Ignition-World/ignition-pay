import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/features/send/send_confirmation_sheet.dart';

import '../../test_utils.dart';

void main() {
  late MockHapticService haptics;

  setUp(() {
    haptics = MockHapticService();
    stubHapticsNoOp(haptics);
  });

  testWidgets('fires a medium haptic when the send button is pressed',
      (tester) async {
    var confirmed = false;

    await tester.pumpWidget(
      testApp(
        SendConfirmationSheet(
          recipient: 'GABCD123',
          amount: '10',
          asset: 'XLM',
          fee: '0.00001',
          onConfirm: () => confirmed = true,
          hapticService: haptics,
        ),
      ),
    );

    await tester.tap(find.text('Slide to send'));
    await tester.pump();

    verify(() => haptics.mediumImpact()).called(1);
    expect(confirmed, isTrue);
  });
}
