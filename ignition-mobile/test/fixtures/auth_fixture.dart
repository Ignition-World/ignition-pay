import 'user_fixture.dart';

/// Pre-built JSON maps that mirror real auth API responses.
///
/// Use [AuthFixture.loginResponse] to simulate a successful login, and
/// [AuthFixture.loginErrorResponse] for failure scenarios.
class AuthFixture {
  AuthFixture._();

  static const String _defaultAccessToken = 'mock-access-token-abc123';
  static const String _defaultRefreshToken = 'mock-refresh-token-xyz789';

  /// Successful `/auth/login` or `/users/login` response body.
  static Map<String, dynamic> loginResponse({
    String accessToken = _defaultAccessToken,
    String refreshToken = _defaultRefreshToken,
    String? userId,
    String? email,
    String? displayName,
  }) {
    return {
      'success': true,
      'message': 'Login successful',
      'data': {
        'access_token': accessToken,
        'refresh_token': refreshToken,
        'token_type': 'Bearer',
        'expires_in': 3600,
        'user': UserFixture.toJson(
          id: userId ?? 'user_test_001',
          email: email ?? 'test@example.com',
          displayName: displayName ?? 'Test User',
        ),
      },
    };
  }

  /// Failed login response (e.g. wrong credentials).
  static Map<String, dynamic> loginErrorResponse({
    String message = 'Invalid email or password.',
    String errorCode = 'INVALID_CREDENTIALS',
  }) {
    return {
      'success': false,
      'message': message,
      'error_code': errorCode,
    };
  }

  /// Successful `/auth/refresh` response body.
  static Map<String, dynamic> refreshResponse({
    String accessToken = 'mock-refreshed-access-token',
    String refreshToken = 'mock-refreshed-refresh-token',
  }) {
    return {
      'success': true,
      'data': {
        'access_token': accessToken,
        'refresh_token': refreshToken,
        'token_type': 'Bearer',
        'expires_in': 3600,
      },
    };
  }

  /// Successful `/auth/logout` response body.
  static Map<String, dynamic> logoutResponse() {
    return {
      'success': true,
      'message': 'Logged out successfully.',
    };
  }

  /// Response returned when an auth token has expired (HTTP 401).
  static Map<String, dynamic> unauthorizedResponse() {
    return {
      'success': false,
      'message': 'Unauthorized. Token expired or invalid.',
      'error_code': 'TOKEN_EXPIRED',
    };
  }

  /// Credentials commonly used across login tests.
  static const String testEmail = 'test@example.com';
  static const String testPassword = 'SecurePass123!';
  static const String testAccessToken = _defaultAccessToken;
  static const String testRefreshToken = _defaultRefreshToken;
}
