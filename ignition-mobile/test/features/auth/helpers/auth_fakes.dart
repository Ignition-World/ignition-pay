import 'package:ignition_mobile/features/auth/services/biometric_service.dart';

/// Controllable [BiometricService] for the biometric widget tests.
class FakeBiometricService implements BiometricService {
  bool supported = true;
  bool enabled = true;
  BiometricAuthResult result = BiometricAuthResult.success;
  int authenticateCalls = 0;
  String? lastReason;

  @override
  Future<bool> isSupported() async => supported;

  @override
  Future<bool> isEnabled() async => enabled;

  @override
  Future<void> setEnabled(bool value) async => enabled = value;

  @override
  Future<BiometricAuthResult> authenticate({String reason = 'test'}) async {
    authenticateCalls++;
    lastReason = reason;
    return result;
  }
}
