import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/config/env_config.dart';
import 'package:ignition_mobile/core/network/api_client.dart';

/// Mock [Dio] adapter for testing interceptor behavior without real HTTP.
class MockHttpClientAdapter implements HttpClientAdapter {
  MockHttpClientAdapter();

  final Map<String, Future<Response<dynamic>> Function(RequestOptions)> _handlers = {};

  void onPost(String path, Future<Response<dynamic>> Function(RequestOptions) handler) {
    _handlers['POST:$path'] = handler;
  }

  void onGet(String path, Future<Response<dynamic>> Function(RequestOptions) handler) {
    _handlers['GET:$path'] = handler;
  }

  void onAny(String method, String path, Future<Response<dynamic>> Function(RequestOptions) handler) {
    _handlers['$method:$path'] = handler;
  }

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<dynamic>? requestStream, Future? cancelFuture) async {
    final key = '${options.method}:${options.path}';
    final handler = _handlers[key];

    if (handler != null) {
      final response = await handler(options);
      final dataString = response.data is String 
          ? response.data 
          : jsonEncode(response.data);
      final headers = <String, List<String>>{
        'content-type': ['application/json'],
        ...response.headers.map ?? {},
      };
      return ResponseBody.fromBytes(
        dataString.codeUnits,
        response.statusCode ?? 200,
        headers: headers,
      );
    }

    // Default: 404
    throw DioException(
      requestOptions: options,
      response: Response<dynamic>(
        requestOptions: options,
        statusCode: 404,
        data: {'error': 'Not found'},
      ),
      type: DioExceptionType.badResponse,
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Testable [ApiClient] that allows injecting a mock adapter.
class TestableApiClient extends ApiClient {
  TestableApiClient() : super.forTesting();

  late MockHttpClientAdapter mockAdapter;
  late Dio mockDio;

  @override
  void initialize() {
    super.initialize();
    mockAdapter = MockHttpClientAdapter();
    mockDio = Dio(BaseOptions(baseUrl: EnvConfig().apiBaseUrl));
    mockDio.httpClientAdapter = mockAdapter;
    dio.httpClientAdapter = mockAdapter;
    // Override refresh client factory to use the same mock adapter
    refreshClientFactory = () {
      final d = Dio(BaseOptions(baseUrl: EnvConfig().apiBaseUrl));
      d.httpClientAdapter = mockAdapter;
      return d;
    };
  }
}

void main() {
  group('ApiClient token refresh', () {
    late TestableApiClient apiClient;

    setUp(() {
      // Initialize dotenv for each test
      dotenv.loadFromString(envString: 'AUTH_TOKEN=expired-access-token\nREFRESH_TOKEN=valid-refresh-token\n');
      apiClient = TestableApiClient();
      apiClient.initialize();
    });

    tearDown(() {
      dotenv.clean();
    });

    test('single 401 triggers refresh and retries original request', () async {
      var refreshCalled = false;
      var originalRequestRetried = false;

      // First request to /data returns 401
      apiClient.mockAdapter.onGet('/data', (options) async {
        if (!originalRequestRetried) {
          originalRequestRetried = true;
          return Response<dynamic>(
            requestOptions: options,
            statusCode: 401,
            data: {'error': 'Unauthorized'},
          );
        }
        // After refresh, should succeed
        expect(options.headers['Authorization'], 'Bearer new-access-token');
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: {'data': 'success'},
        );
      });

      // Refresh endpoint returns new token
      apiClient.mockAdapter.onPost('/auth/refresh', (options) async {
        refreshCalled = true;
        expect(options.data['refresh_token'], 'valid-refresh-token');
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: {'access_token': 'new-access-token'},
        );
      });

      final result = await apiClient.get('/data');

      expect(result.statusCode, 200);
      expect(result.data, {'data': 'success'});
      expect(refreshCalled, isTrue);
      // Token should be updated
      expect(dotenv.env['AUTH_TOKEN'], 'new-access-token');
    });

    test('concurrent 401s are coalesced into single refresh', () async {
      var refreshCallCount = 0;
      final completer = Completer<void>();

      // All requests to /data return 401 initially
      apiClient.mockAdapter.onGet('/data', (options) async {
        if (options.headers['Authorization'] == 'Bearer expired-access-token') {
          return Response<dynamic>(
            requestOptions: options,
            statusCode: 401,
            data: {'error': 'Unauthorized'},
          );
        }
        expect(options.headers['Authorization'], 'Bearer new-access-token');
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: {'data': 'success'},
        );
      });

      // Refresh endpoint - delay to simulate network
      apiClient.mockAdapter.onPost('/auth/refresh', (options) async {
        refreshCallCount++;
        await completer.future; // Wait for signal
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: {'access_token': 'new-access-token'},
        );
      });

      // Fire 3 concurrent requests
      final futures = [
        apiClient.get('/data'),
        apiClient.get('/data'),
        apiClient.get('/data'),
      ];

      // Give time for all requests to hit the interceptor
      await Future.delayed(const Duration(milliseconds: 50));

      // Complete the refresh
      completer.complete();

      final results = await Future.wait(futures);

      // All should succeed
      for (final r in results) {
        expect(r.statusCode, 200);
        expect(r.data, {'data': 'success'});
      }

      // Refresh should only be called ONCE
      expect(refreshCallCount, 1);
    });

    test('refresh failure throws AuthFailureException wrapped in DioException', () async {
      apiClient.mockAdapter.onGet('/data', (options) async {
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 401,
          data: {'error': 'Unauthorized'},
        );
      });

      // Refresh endpoint fails
      apiClient.mockAdapter.onPost('/auth/refresh', (options) async {
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 401,
          data: {'error': 'Invalid refresh token'},
        );
      });

      final future = apiClient.get('/data');
      await expectLater(
        future,
        throwsA(isA<DioException>().having((e) => e.error, 'error', isA<AuthFailureException>())),
      );

      // Tokens should be cleared
      expect(dotenv.env.containsKey('AUTH_TOKEN'), isFalse);
      expect(dotenv.env.containsKey('REFRESH_TOKEN'), isFalse);
    });

    test('max 1 retry per request - second 401 throws AuthFailureException', () async {
      var requestCount = 0;

      apiClient.mockAdapter.onGet('/data', (options) async {
        requestCount++;
        if (requestCount <= 2) {
          // First attempt (original) and second attempt (retry) both return 401
          return Response<dynamic>(
            requestOptions: options,
            statusCode: 401,
            data: {'error': 'Unauthorized'},
          );
        }
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: {'data': 'success'},
        );
      });

      apiClient.mockAdapter.onPost('/auth/refresh', (options) async {
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: {'access_token': 'new-access-token'},
        );
      });

      // First 401 triggers refresh, retry gets 401 again -> should throw AuthFailureException
      await expectLater(
        apiClient.get('/data'),
        throwsA(isA<DioException>().having((e) => e.error, 'error', isA<AuthFailureException>())),
      );
    });

    test('refresh request itself getting 401 does not loop', () async {
      var refreshCallCount = 0;

      apiClient.mockAdapter.onGet('/data', (options) async {
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 401,
          data: {'error': 'Unauthorized'},
        );
      });

      // Refresh endpoint returns 401
      apiClient.mockAdapter.onPost('/auth/refresh', (options) async {
        refreshCallCount++;
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 401,
          data: {'error': 'Invalid refresh token'},
        );
      });

      await expectLater(
        apiClient.get('/data'),
        throwsA(isA<DioException>().having((e) => e.error, 'error', isA<AuthFailureException>())),
      );

      // Refresh should only be attempted once (not loop)
      expect(refreshCallCount, 1);
    });

    test('request without refresh token throws AuthFailureException', () async {
      dotenv.loadFromString(envString: 'AUTH_TOKEN=expired-access-token\n');

      apiClient.mockAdapter.onGet('/data', (options) async {
        return Response<dynamic>(
          requestOptions: options,
          statusCode: 401,
          data: {'error': 'Unauthorized'},
        );
      });

      await expectLater(
        apiClient.get('/data'),
        throwsA(isA<DioException>().having((e) => e.error, 'error', isA<AuthFailureException>())),
      );
    });
  });
}