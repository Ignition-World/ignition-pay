// Mock network plumbing for integration tests.
//
// We monkey-patch [ApiClient] by inserting a [MockInterceptor] into its
// underlying Dio instance. The real app code (api_client.dart) builds real
// requests, but the interceptor short-circuits the network and replies with
// canned [AuthFixture] / [UserFixture] payloads. This keeps the integration
// layer honest (real NavigationService + GoRouter + Widgets) while removing
// flakiness from the network.

import 'package:dio/dio.dart';
import 'package:ignition_mobile/core/network/api_client.dart';

// IMPORTANT: Use *relative* imports into ../test/. `package:`-style imports of
// `package:ignition_mobile/test/...` do not resolve when the on-device
// integration_test bundle is compiled, because the bundle graph only
// includes `lib/`, not `test/`. Relative imports let the integration_test
// runner discover the fixture files in either test runner mode.
import '../../test/fixtures/auth_fixture.dart';
import '../../test/fixtures/base_response_fixture.dart';
import '../../test/fixtures/user_fixture.dart';

/// A named route → canned-response map used by [MockInterceptor].
///
/// Returning `null` from this callback lets the error propagate up the
/// interceptor chain (so production refresh logic can run). Returning a
/// non-null value resolves the error with a fabricated 200 response.
typedef RouteHandler = dynamic Function(RequestOptions options);

class MockInterceptor extends Interceptor {
  MockInterceptor({Map<String, RouteHandler> routes = const {}})
      : _routes = Map.of(routes);

  final Map<String, RouteHandler> _routes;

  /// Total number of requests the interceptor has handled.
  int requestCount = 0;

  /// Concrete (method, path) → canned-response payloads staged by the test.
  /// Keys are interpolated as `$method $path`, e.g. `GET /users/me`.
  final Map<String, dynamic> _staged = {};

  void stage(String method, String path, dynamic response) {
    _staged['$method $path'] = response;
  }

  void route(String key, RouteHandler handler) {
    _routes[key] = handler;
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    requestCount++;
    super.onRequest(options, handler);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    // Real responses pass through untouched.
    super.onResponse(response, handler);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final method = err.requestOptions.method.toUpperCase();
    final path = _stripQuery(err.requestOptions.path);
    final key = '$method $path';

    // CRITICAL: pass 401 errors straight through so the *production*
    // `ApiClient._handleTokenRefresh` interceptor can take over and
    // exercise the real retry path. If we resolve the 401 here the
    // production refresh logic never runs and the user's access token
    // never rotates.
    if (err.response?.statusCode == 401) {
      return handler.next(err);
    }

    // For *any* other error (500, network failure, etc.) check whether
    // the test staged a custom payload for this route.
    if (_routes.containsKey(key)) {
      dynamic data;
      try {
        data = _routes[key]!(err.requestOptions);
      } catch (_) {
        // A throwing handler must not crash the interceptor chain —
        // let the original error propagate.
        return handler.next(err);
      }
      if (data != null) {
        return handler.resolve(Response<dynamic>(
          requestOptions: err.requestOptions,
          statusCode: 200,
          data: data,
        ));
      }
    }

    // Fallback: parity with the test's call-count expectation. If the
    // path was *explicitly* staged we use that payload, otherwise we
    // hand control back to the next interceptor.
    if (_staged.containsKey(key)) {
      return handler.resolve(Response<dynamic>(
        requestOptions: err.requestOptions,
        statusCode: 200,
        data: _staged[key],
      ));
    }

    super.onError(err, handler);
  }
}

String _stripQuery(String path) {
  final i = path.indexOf('?');
  return i == -1 ? path : path.substring(0, i);
}

/// Convenience — register and return a [MockInterceptor] so scenarios can do
///
/// ```dart
/// final mock = MockInterceptor();
/// installMock(mock);
/// mock.stage('GET', '/users/me', AuthFixture.loginResponse()['data']['user']);
/// ```
MockInterceptor installDefaultMock({Map<String, RouteHandler> routes = const {}}) {
  final interceptor = MockInterceptor(routes: routes);
  // The real Dio instance lives on the singleton ApiClient; reach in and
  // add our interceptor first in the chain so it short-circuits before
  // production interceptors can fire.
  ApiClient().dio.interceptors.insert(0, interceptor);
  return interceptor;
}

/// Sensible defaults for tests that don't care about specific responses.
void installHealthyMockNetwork() {
  final mock = installDefaultMock();
  mock.stage('GET', '/users/me', BaseResponseFixture.success(
    data: UserFixture.toJson(),
  ));
  mock.stage('POST', '/auth/refresh', AuthFixture.refreshResponse());
  mock.stage('POST', '/auth/logout', AuthFixture.logoutResponse());
}

/// Removes every interceptor we installed on the singleton `ApiClient.dio`.
///
/// Call from `tearDown` / `tearDownAll` to keep the interceptor chain clean
/// across scenarios. Without this, a 401-refresh mock from one test can leak
/// into the next one and produce surprising assertions.
void uninstallApiClientMocks() {
  final api = ApiClient();
  if (!api.isInitialized) return;
  api.dio.interceptors.clear();
}
