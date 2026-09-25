/// Typed exception hierarchy for API errors.
///
/// All network calls in [ApiClient] map raw [DioException]s to one of these
/// concrete subtypes so that callers receive structured, user-friendly
/// information without raw Dio internals leaking to the UI.
///
/// Usage in a widget:
/// ```dart
/// try {
///   final data = await authService.getCurrentUser();
/// } on ApiException catch (e) {
///   setState(() => _error = e);
/// }
/// ```
/// Then render `ErrorStateView(error: _error, onRetry: _load)` — the widget
/// already knows which icon and message to display per subtype.
library;

import 'package:dio/dio.dart';

/// Base class for every API failure surfaced by [ApiClient].
sealed class ApiException implements Exception {
  const ApiException({required this.userMessage});

  /// A safe, human-readable message for display in the UI.
  /// Never contains raw exception data or internal stack details.
  final String userMessage;

  @override
  String toString() => 'ApiException: $userMessage';
}

/// The device has no active network connection.
final class NoConnectionException extends ApiException {
  const NoConnectionException()
      : super(userMessage: 'No connection. Check your internet and try again.');
}

/// The request timed out or the response arrived too slowly.
final class SlowConnectionException extends ApiException {
  const SlowConnectionException()
      : super(
            userMessage:
                'Slow connection. The request took too long — please try again.');
}

/// The server returned a 5xx error or an unexpected response.
final class ServerException extends ApiException {
  const ServerException()
      : super(userMessage: 'Server error. Something went wrong on our end — please try again.');
}

/// The access token is expired or invalid (HTTP 401).
///
/// The UI should redirect to the login screen rather than showing a retry.
final class UnauthorizedException extends ApiException {
  const UnauthorizedException()
      : super(userMessage: 'Your session has expired. Please sign in again.');
}

/// Any other non-network, non-auth error (4xx client errors, parse failures, …).
final class UnexpectedApiException extends ApiException {
  const UnexpectedApiException()
      : super(userMessage: 'Something went wrong. Please try again.');
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/// Converts a raw [DioException] into a typed [ApiException].
///
/// This is the single place where Dio internals are inspected, keeping
/// all other layers free of Dio imports.
ApiException apiExceptionFromDio(DioException e) {
  switch (e.type) {
    case DioExceptionType.connectionError:
      return const NoConnectionException();

    case DioExceptionType.connectionTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.sendTimeout:
      return const SlowConnectionException();

    case DioExceptionType.badResponse:
      final statusCode = e.response?.statusCode ?? 0;
      if (statusCode == 401) return const UnauthorizedException();
      if (statusCode >= 500) return const ServerException();
      // 4xx client errors — don't expose HTTP details to user.
      return const UnexpectedApiException();

    case DioExceptionType.cancel:
    case DioExceptionType.unknown:
    case DioExceptionType.badCertificate:
      // Treat socket/DNS errors and unknown failures as no-connection.
      final message = e.message ?? '';
      if (message.contains('SocketException') ||
          message.contains('Failed host lookup') ||
          message.contains('Network is unreachable')) {
        return const NoConnectionException();
      }
      return const UnexpectedApiException();
  }
}
