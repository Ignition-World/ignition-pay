import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/features/receive/deposit_address_selector.dart';

import '../../test_utils.dart';

void main() {
  const savings = DepositAddress(
    label: 'Savings',
    address: 'GSAVINGS',
    network: 'TESTNET',
  );
  const spending = DepositAddress(
    label: 'Spending',
    address: 'GSPENDING',
    network: 'TESTNET',
  );

  late MockHapticService haptics;

  setUp(() {
    haptics = MockHapticService();
    stubHapticsNoOp(haptics);
  });

  testWidgets('fires a selection cue when a different address is picked',
      (tester) async {
    DepositAddress? selected = savings;

    await tester.pumpWidget(
      testApp(
        DepositAddressSelector(
          addresses: const [savings, spending],
          selected: selected,
          onSelected: (value) => selected = value,
          hapticService: haptics,
        ),
      ),
    );

    await tester.tap(find.byType(DropdownButtonFormField<DepositAddress>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Spending (TESTNET)').last);
    await tester.pumpAndSettle();

    verify(() => haptics.selectionClick()).called(1);
    expect(selected, spending);
  });
}
