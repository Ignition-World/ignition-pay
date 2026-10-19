import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/features/settings/pages/security_settings_page.dart';

import 'helpers/auth_fakes.dart';

void main() {
  testWidgets('reflects the stored preference and persists changes',
      (tester) async {
    final service = FakeBiometricService();

    await tester.pumpWidget(
      MaterialApp(home: SecuritySettingsPage(biometricService: service)),
    );
    await tester.pumpAndSettle();

    final toggle = tester.widget<SwitchListTile>(
      find.byKey(const Key('biometric_toggle')),
    );
    expect(toggle.value, isTrue);
    expect(toggle.onChanged, isNotNull);

    await tester.tap(find.byKey(const Key('biometric_toggle')));
    await tester.pumpAndSettle();

    expect(service.enabled, isFalse);
    expect(
      tester
          .widget<SwitchListTile>(find.byKey(const Key('biometric_toggle')))
          .value,
      isFalse,
    );
  });

  testWidgets('disables the toggle when biometrics are unsupported',
      (tester) async {
    final service = FakeBiometricService()..supported = false;

    await tester.pumpWidget(
      MaterialApp(home: SecuritySettingsPage(biometricService: service)),
    );
    await tester.pumpAndSettle();

    final toggle = tester.widget<SwitchListTile>(
      find.byKey(const Key('biometric_toggle')),
    );
    expect(toggle.onChanged, isNull);
    expect(
      find.text('Biometrics are not available on this device.'),
      findsOneWidget,
    );
  });
}
