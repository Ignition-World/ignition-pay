import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/features/auth/services/biometric_service.dart';
import 'package:ignition_mobile/features/auth/widgets/biometric_gate.dart';

import 'helpers/auth_fakes.dart';

Widget wrap(BiometricService service) => MaterialApp(
      home: BiometricGate(
        biometricService: service,
        child: const Scaffold(body: Text('secret dashboard')),
      ),
    );

const lockFinder = Key('biometric_lock_screen');
const unlockButton = Key('biometric_unlock_button');

void main() {
  testWidgets('shows content immediately when biometrics are not enrolled',
      (tester) async {
    final service = FakeBiometricService()..enabled = false;

    await tester.pumpWidget(wrap(service));
    await tester.pumpAndSettle();

    expect(find.text('secret dashboard'), findsOneWidget);
    expect(find.byKey(lockFinder), findsNothing);
    expect(service.authenticateCalls, 0);
  });

  testWidgets('locks enrolled users and unlocks after a successful prompt',
      (tester) async {
    final service = FakeBiometricService()
      ..result = BiometricAuthResult.failed;

    await tester.pumpWidget(wrap(service));
    await tester.pumpAndSettle();

    // Cold start prompts once and locks while unauthenticated.
    expect(service.authenticateCalls, 1);
    expect(find.byKey(lockFinder), findsOneWidget);
    expect(find.text('secret dashboard'), findsNothing);

    service.result = BiometricAuthResult.success;
    await tester.tap(find.byKey(unlockButton));
    await tester.pumpAndSettle();

    expect(find.text('secret dashboard'), findsOneWidget);
    expect(find.byKey(lockFinder), findsNothing);
  });

  testWidgets('a failed attempt keeps the app locked', (tester) async {
    final service = FakeBiometricService()
      ..result = BiometricAuthResult.failed;

    await tester.pumpWidget(wrap(service));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(unlockButton));
    await tester.pumpAndSettle();

    expect(service.authenticateCalls, 2);
    expect(find.byKey(lockFinder), findsOneWidget);
    expect(find.text('secret dashboard'), findsNothing);
  });

  testWidgets('re-checks and re-locks when the app resumes', (tester) async {
    final service = FakeBiometricService();

    await tester.pumpWidget(wrap(service));
    await tester.pumpAndSettle();
    expect(find.text('secret dashboard'), findsOneWidget);

    service.result = BiometricAuthResult.failed;
    tester.binding
        .handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byKey(lockFinder), findsOneWidget);
    expect(find.text('secret dashboard'), findsNothing);
  });

  testWidgets('does not lock when biometrics are unsupported', (tester) async {
    final service = FakeBiometricService()..supported = false;

    await tester.pumpWidget(wrap(service));
    await tester.pumpAndSettle();

    expect(find.text('secret dashboard'), findsOneWidget);
    expect(find.byKey(lockFinder), findsNothing);
  });

  testWidgets('uses the configured unlock reason', (tester) async {
    final service = FakeBiometricService()
      ..result = BiometricAuthResult.failed;

    await tester.pumpWidget(wrap(service));
    await tester.pumpAndSettle();

    expect(service.lastReason, 'Unlock Ignition Pay');
  });
}
