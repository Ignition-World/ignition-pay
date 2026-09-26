import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/monitoring/security_event_reporter.dart';

/// Outcome of a biometric unlock attempt.
enum BiometricAuthResult {
  /// The user authenticated successfully.
  success,

  /// The prompt was shown but the user failed (or cancelled) it.
  failed,

  /// Biometrics are not available/enrolled — the caller should fall back to
  /// the device PIN/password affordance.
  unavailable,

  /// Something unexpected went wrong (platform error).
  error,
}

/// Thin seam over the platform biometric API so [BiometricService] can be
/// exercised without a device.
abstract class BiometricAuthenticator {
  /// Whether the device can authenticate the user at all, including a
  /// PIN/passcode/pattern fallback.
  Future<bool> isDeviceSupported();

  /// Whether the device has biometric hardware with enrolled credentials.
  Future<bool> canCheckBiometrics();

  /// Currently enrolled biometric types.
  Future<List<BiometricType>> availableBiometrics();

  /// Shows the platform prompt. When [biometricOnly] is false the OS is
  /// allowed to fall back to the device PIN/password.
  Future<bool> authenticate({
    required String reason,
    required bool biometricOnly,
  });
}

/// [BiometricAuthenticator] backed by `local_auth`.
class LocalAuthBiometricAuthenticator implements BiometricAuthenticator {
  LocalAuthBiometricAuthenticator({LocalAuthentication? localAuth})
      : _localAuth = localAuth ?? LocalAuthentication();

  final LocalAuthentication _localAuth;

  @override
  Future<bool> isDeviceSupported() => _localAuth.isDeviceSupported();

  @override
  Future<bool> canCheckBiometrics() => _localAuth.canCheckBiometrics;

  @override
  Future<List<BiometricType>> availableBiometrics() =>
      _localAuth.getAvailableBiometrics();

  @override
  Future<bool> authenticate({
    required String reason,
    required bool biometricOnly,
  }) {
    return _localAuth.authenticate(
      localizedReason: reason,
      biometricOnly: biometricOnly,
      persistAcrossBackgrounding: true,
    );
  }
}

/// Contract for app-unlock biometrics.
///
/// The enrolled/disabled preference is persisted so it survives restarts, and
/// the actual prompt always allows the OS to fall back to the device
/// PIN/password when biometrics are unavailable.
abstract class BiometricService {
  /// Whether this device can use biometrics (with or without a PIN fallback).
  Future<bool> isSupported();

  /// Whether the user has opted in to biometric unlock.
  Future<bool> isEnabled();

  /// Persists the user's opt-in preference.
  Future<void> setEnabled(bool enabled);

  /// Prompts the user to unlock the app.
  Future<BiometricAuthResult> authenticate({String reason});
}

/// Production [BiometricService] using `local_auth` + `shared_preferences`.
class LocalBiometricService implements BiometricService {
  LocalBiometricService({
    BiometricAuthenticator? authenticator,
    SecurityEventReporter reporter = const SentrySecurityEventReporter(),
  })  : _authenticator = authenticator ?? LocalAuthBiometricAuthenticator(),
        _reporter = reporter;

  /// Preference key storing the user's biometric opt-in.
  static const String enabledPreferenceKey = 'biometrics_enabled';

  static const String _defaultReason = 'Unlock Ignition Pay';

  final BiometricAuthenticator _authenticator;
  final SecurityEventReporter _reporter;

  @override
  Future<bool> isSupported() async {
    try {
      if (await _authenticator.isDeviceSupported()) return true;
      return await _authenticator.canCheckBiometrics();
    } catch (error, stackTrace) {
      await _reporter.reportFailure(
        error,
        stackTrace,
        reason: 'biometric_support_check_failed',
      );
      return false;
    }
  }

  @override
  Future<bool> isEnabled() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getBool(enabledPreferenceKey) ?? false;
  }

  @override
  Future<void> setEnabled(bool enabled) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(enabledPreferenceKey, enabled);
  }

  @override
  Future<BiometricAuthResult> authenticate({
    String reason = _defaultReason,
  }) async {
    try {
      // `biometricOnly: false` lets the OS present the device PIN/password
      // fallback whenever biometrics fail or are unavailable.
      final authenticated = await _authenticator.authenticate(
        reason: reason,
        biometricOnly: false,
      );
      if (authenticated) return BiometricAuthResult.success;

      await _reporter.reportEvent(
        'Biometric unlock attempt failed',
        reason: 'biometric_authentication_failed',
      );
      return BiometricAuthResult.failed;
    } on PlatformException catch (error, stackTrace) {
      await _reporter.reportFailure(
        error,
        stackTrace,
        reason: 'biometric_authentication_error',
      );
      return BiometricAuthResult.unavailable;
    } catch (error, stackTrace) {
      await _reporter.reportFailure(
        error,
        stackTrace,
        reason: 'biometric_authentication_error',
      );
      return BiometricAuthResult.error;
    }
  }
}
