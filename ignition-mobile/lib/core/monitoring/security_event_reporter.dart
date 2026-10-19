import 'package:sentry_flutter/sentry_flutter.dart';

/// Sink for security-relevant events and failures (biometric unlock failures,
/// offline submission errors, …).
///
/// Abstracted so services can be unit-tested without initialising Sentry.
abstract class SecurityEventReporter {
  /// Records [error] with [stackTrace] and an optional human-readable [reason].
  Future<void> reportFailure(
    Object error,
    StackTrace stackTrace, {
    String? reason,
  });

  /// Records a non-fatal [message] such as a rejected unlock attempt.
  Future<void> reportEvent(String message, {String? reason});
}

/// Default [SecurityEventReporter], forwarding events to Sentry.
class SentrySecurityEventReporter implements SecurityEventReporter {
  const SentrySecurityEventReporter();

  @override
  Future<void> reportFailure(
    Object error,
    StackTrace stackTrace, {
    String? reason,
  }) async {
    await Sentry.captureException(
      error,
      stackTrace: stackTrace,
      hint: reason != null
          ? Hint.withMap(<String, String>{'reason': reason})
          : null,
    );
  }

  @override
  Future<void> reportEvent(String message, {String? reason}) async {
    await Sentry.captureMessage(
      reason == null ? message : '$message ($reason)',
      level: SentryLevel.warning,
    );
  }
}
