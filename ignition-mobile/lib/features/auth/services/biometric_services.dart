import 'biometric_service.dart';

/// Process-wide biometric service shared by the app shell and settings UI.
class BiometricServices {
  BiometricServices._();

  /// Shared service so the unlock gate and the settings toggle agree on the
  /// enrolled preference.
  static final BiometricService service = LocalBiometricService();
}
