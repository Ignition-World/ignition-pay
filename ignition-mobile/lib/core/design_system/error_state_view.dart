import 'package:flutter/material.dart';

import '../network/api_exception.dart';
import 'app_button.dart';

/// Full-screen (or centre-of-scrollview) error state shown when an API call
/// fails.
///
/// Shows:
///  - a contextual icon (no signal, cloud-off, or generic error)
///  - a user-friendly message derived from [error]
///  - an optional retry button that displays a spinner while [retrying] is
///    true; passing `null` for [onRetry] hides the button entirely (used for
///    [UnauthorizedException] which redirects to login instead)
///
/// Inject [hapticService] in tests to suppress real vibration calls on the
/// inner [AppErrorBanner].
///
/// ```dart
/// if (_error != null)
///   ErrorStateView(
///     error: _error!,
///     retrying: _retrying,
///     onRetry: _error is UnauthorizedException ? null : _load,
///   )
/// ```
class ErrorStateView extends StatelessWidget {
  const ErrorStateView({
    super.key,
    required this.error,
    this.onRetry,
    this.retrying = false,
  });

  /// The typed [ApiException] that caused the error.
  final ApiException error;

  /// Called when the user taps "Try again". Pass `null` to hide the button
  /// (e.g. for [UnauthorizedException]).
  final VoidCallback? onRetry;

  /// When `true` the retry button shows a loading spinner and is disabled.
  final bool retrying;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  IconData _icon() {
    return switch (error) {
      NoConnectionException() => Icons.signal_wifi_off_outlined,
      SlowConnectionException() => Icons.signal_cellular_connected_no_internet_4_bar_outlined,
      ServerException() => Icons.cloud_off_outlined,
      UnauthorizedException() => Icons.lock_outline,
      UnexpectedApiException() => Icons.error_outline,
    };
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _icon(),
              size: 56,
              color: colorScheme.error,
              semanticLabel: _semanticLabel(),
            ),
            const SizedBox(height: 16),
            Text(
              error.userMessage,
              textAlign: TextAlign.center,
              style: textTheme.bodyLarge?.copyWith(
                color: colorScheme.onSurface,
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              AppButton(
                key: const Key('error_retry_button'),
                label: 'Try again',
                loading: retrying,
                onPressed: retrying ? null : onRetry,
                variant: AppButtonVariant.secondary,
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _semanticLabel() => switch (error) {
        NoConnectionException() => 'No connection',
        SlowConnectionException() => 'Slow connection',
        ServerException() => 'Server error',
        UnauthorizedException() => 'Session expired',
        UnexpectedApiException() => 'Error',
      };
}
