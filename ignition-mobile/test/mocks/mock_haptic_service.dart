import 'package:mocktail/mocktail.dart';
import 'package:ignition_mobile/core/haptic_service.dart';

class MockHapticService extends Mock implements HapticService {}

/// Stubs every haptic cue to succeed silently — useful when haptic behaviour
/// is not the focus of the test under scrutiny.
void stubHapticsNoOp(MockHapticService mock) {
  when(() => mock.lightImpact()).thenAnswer((_) async {});
  when(() => mock.mediumImpact()).thenAnswer((_) async {});
  when(() => mock.heavyImpact()).thenAnswer((_) async {});
  when(() => mock.selectionClick()).thenAnswer((_) async {});
}
