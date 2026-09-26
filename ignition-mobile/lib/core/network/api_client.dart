import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:meta/meta.dart';
import '../../config/env_config.dart';

/// Exception thrown when authentication fails and user needs to re-login.
class AuthFailureException implements Exception {
  const AuthFailureException(this.message);
  final String message;

  @override
  String toString() => 'AuthFailureException: $message';
}

/// Keys for request options extra map to track refresh state.
class _RefreshKeys {
  static const String retryCount = '_refresh_retry_count';
  static const String isRefreshRequest = '_is_refresh_request';
  static const String originalError = '_original_error';
}

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  /// Creates a new instance for testing purposes.
  @visibleForTesting
  ApiClient.forTesting() {
    // Singleton instance will throw if accessed, but tests use their own instance
  }

  /// Factory for creating the refresh Dio client. Override in tests.
  @visibleForTesting
  Dio Function() refreshClientFactory = () => Dio(BaseOptions(baseUrl: EnvConfig().apiBaseUrl));

  late final Dio dio;
  bool _initialized = false;

  /// True after [initialize] has been called and the underlying [dio] is
  /// ready to dispatch requests.
  bool get isInitialized => _initialized;

  /// Returns the current auth token if available.
  String? getAuthToken() {
    return dotenv.env['AUTH_TOKEN'];
  }

  final EnvConfig _envConfig = EnvConfig();

  /// Lock for coalescing concurrent token refresh requests.
  Completer<void>? _refreshLock;

  /// Number of requests waiting on the refresh lock.
  int _refreshWaiters = 0;

  /// Whether a refresh is currently in progress.
  bool _isRefreshing = false;

  void initialize() {
    dio = Dio(
      BaseOptions(
        baseUrl: _envConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    // Add interceptors
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          // Add auth token to requests (skip for refresh requests)
          if (options.extra[_RefreshKeys.isRefreshRequest] != true) {
            final token = dotenv.env['AUTH_TOKEN'];
            if (token != null) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          return handler.next(options);
        },
        onResponse: (response, handler) {
          // Log responses in debug mode
          if (_envConfig.isDebug) {
            print('📡 API Response: ${response.statusCode} - ${response.requestOptions.uri}');
          }
          return handler.next(response);
        },
        onError: (DioException e, handler) async {
          if (_envConfig.isDebug) {
            print('🔄 Interceptor onError: ${e.error ?? e.message} (retryCount: ${e.requestOptions.extra[_RefreshKeys.retryCount]})');
          }
          // Handle token refresh on 401 errors
          if (e.response?.statusCode == 401) {
            try {
              await _handleTokenRefresh(e, handler);
            } catch (wrappedError) {
              // _handleTokenRefresh throws wrapped DioException on failure
              return handler.next(wrappedError as DioException);
            }
          } else {
            if (_envConfig.isDebug) {
              print('❌ API Error: ${e.response?.statusCode} - ${e.message}');
            }
            return handler.next(e);
          }
        },
      ),
    );

    // Add logging interceptor in debug mode
    if (_envConfig.isDebug) {
      dio.interceptors.add(LogInterceptor(
        requestBody: true,
        responseBody: true,
      ));
    }

    _initialized = true;
  }

  /// Handles 401 errors by attempting token refresh with proper guards.
  ///
  /// Guards implemented:
  /// - Maximum 1 retry per request (tracked via requestOptions.extra)
  /// - Skip refresh for refresh endpoint itself (prevents loops)
  /// - Coalesce concurrent 401s with a single refresh
  /// - On refresh failure, throw [AuthFailureException] for UI handling
  Future<void> _handleTokenRefresh(DioException e, ErrorInterceptorHandler handler) async {
    final options = e.requestOptions;

    // Guard 1: Skip if this is the refresh request itself
    if (options.extra[_RefreshKeys.isRefreshRequest] == true) {
      if (_envConfig.isDebug) {
        print('🔄 Refresh request got 401 - not retrying');
      }
      return handler.next(e);
    }

    // Guard 2: Maximum 1 retry attempt per request
    final retryCount = (options.extra[_RefreshKeys.retryCount] as int?) ?? 0;
    if (retryCount >= 1) {
      if (_envConfig.isDebug) {
        print('🔄 Max retry (1) exceeded for ${options.path}');
      }
      // Store original error for potential UI consumption
      options.extra[_RefreshKeys.originalError] = e;
      return handler.next(DioException(
        requestOptions: options,
        response: e.response,
        type: DioExceptionType.badResponse,
        error: AuthFailureException('Session expired. Please log in again.'),
      ));
    }

    // Guard 3: Coalesce concurrent 401s - wait for existing refresh if in progress
    if (_isRefreshing && _refreshLock != null) {
      if (_envConfig.isDebug) {
        print('🔄 Refresh in progress - waiting for existing refresh');
      }
      _refreshWaiters++;
      try {
        await _refreshLock!.future;
        // After refresh completes, retry the original request with new token
        return _retryWithNewToken(options, handler);
      } catch (refreshError) {
        // Refresh failed, propagate auth failure
        return handler.next(DioException(
          requestOptions: options,
          response: e.response,
          type: DioExceptionType.badResponse,
          error: AuthFailureException('Session expired. Please log in again.'),
        ));
      } finally {
        _refreshWaiters--;
      }
    }

    // Start a new refresh cycle
    _isRefreshing = true;
    _refreshLock = Completer<void>();

    try {
      if (_envConfig.isDebug) {
        print('🔄 Starting token refresh');
      }

      final refreshToken = dotenv.env['REFRESH_TOKEN'];

      if (refreshToken == null) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          error: AuthFailureException('No refresh token available'),
        );
      }

      // Create a new dio instance to avoid triggering interceptors
      final refreshDio = refreshClientFactory();
      final response = await refreshDio.post<dynamic>(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
        options: Options(
          extra: {_RefreshKeys.isRefreshRequest: true},
        ),
      );

      if (response.statusCode == 200 && response.data['access_token'] != null) {
        final newAccessToken = response.data['access_token'] as String;
        
        // Update stored token (in-memory for this session)
        dotenv.env['AUTH_TOKEN'] = newAccessToken;
        
        if (_envConfig.isDebug) {
          print('🔄 Token refresh successful');
        }

        // Complete the refresh lock successfully (only if there are waiters)
        if (_refreshWaiters > 0) {
          _refreshLock!.complete();
        }
        _refreshLock = null;

        // Retry the original request with the new token
        return _retryWithNewToken(options, handler, newAccessToken);
      } else {
        throw Exception('Invalid refresh response: ${response.data}');
      }
    } catch (refreshError) {
      if (_envConfig.isDebug) {
        print('🔄 Token refresh failed: $refreshError');
        print('🔄 Before removal - AUTH_TOKEN: ${dotenv.env.containsKey('AUTH_TOKEN')}, REFRESH_TOKEN: ${dotenv.env.containsKey('REFRESH_TOKEN')}');
      }

      // Complete the refresh lock with error (only if there are waiters)
      if (_refreshWaiters > 0) {
        _refreshLock!.completeError(refreshError);
      }
      _refreshLock = null;

      // Clear invalid tokens
      dotenv.env.remove('AUTH_TOKEN');
      dotenv.env.remove('REFRESH_TOKEN');

      if (_envConfig.isDebug) {
        print('🔄 After removal - AUTH_TOKEN: ${dotenv.env.containsKey('AUTH_TOKEN')}, REFRESH_TOKEN: ${dotenv.env.containsKey('REFRESH_TOKEN')}');
      }

      // Preserve specific AuthFailureException messages, wrap others
      String errorMessage;
      if (refreshError is DioException && refreshError.error is AuthFailureException) {
        errorMessage = (refreshError.error as AuthFailureException).message;
      } else {
        errorMessage = 'Session expired. Please log in again.';
      }

      // Throw wrapped error for interceptor to handle
      throw DioException(
        requestOptions: options,
        response: e.response,
        type: DioExceptionType.badResponse,
        error: AuthFailureException(errorMessage),
      );
    } finally {
      _isRefreshing = false;
    }
  }

  /// Retries the original request with the new access token.
  Future<void> _retryWithNewToken(
    RequestOptions options,
    ErrorInterceptorHandler handler, [
    String? newToken,
  ]) async {
    final token = newToken ?? dotenv.env['AUTH_TOKEN'];
    if (token == null) {
      return handler.next(DioException(
        requestOptions: options,
        type: DioExceptionType.badResponse,
        error: AuthFailureException('Session expired. Please log in again.'),
      ));
    }

    // Mark request as retried (max 1 retry)
    options.extra[_RefreshKeys.retryCount] = 1;
    options.headers['Authorization'] = 'Bearer $token';

    try {
      final clonedRequest = await dio.request<dynamic>(
        options.path,
        options: Options(
          method: options.method,
          headers: options.headers,
          extra: options.extra,
        ),
        data: options.data,
        queryParameters: options.queryParameters,
      );
      return handler.resolve(clonedRequest);
    } catch (retryError) {
      // If retry also fails with 401, the interceptor will catch it
      // but retryCount is now 1 so it will throw AuthFailureException
      if (retryError is DioException) {
        return handler.next(retryError);
      }
      return handler.next(DioException(
        requestOptions: options,
        type: DioExceptionType.unknown,
        error: retryError,
      ));
    }
  }

  // Helper methods for common HTTP operations
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters}) async {
    return await dio.get<T>(path, queryParameters: queryParameters);
  }

  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.post<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> put<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.put<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> delete<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.delete<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> patch<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters}) async {
    return await dio.patch<T>(path, data: data, queryParameters: queryParameters);
  }
}