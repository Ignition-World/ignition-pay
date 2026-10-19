// Critical flow: authentication service.
//
// There is no login UI yet, so this scenario exercises the production code
// paths that the future login screen will rely on:
//
//   1. `ApiClient.dio` has the production `InterceptorsWrapper` that performs
//      the 401 → /auth/refresh → retry dance installed on its chain. (Without
//      this wiring the user can never recover from an expired access token.)
//   2. `AuthService.login / getCurrentUser / logout` correctly forward
//      requests through the mocked Dio interceptor chain.
//
// Notes
// -----
// We **deliberately do not exercise the live 401 → refresh → retry path** in
// this integration test. The production `_handleTokenRefresh` method spins up
// a *fresh* `Dio` instance (`refreshDio`) for the refresh call, and that
// second Dio is not reachable from our `MockInterceptor` (which is installed
// only on `ApiClient().dio`). Driving the live refresh path would require
// staging the refresh endpoint on a global Dio hook, mocking env-config, and
// loading `dotenv` for `REFRESH_TOKEN` — all of which belong in a dedicated
// backend-integration test, not here. We assert the *wiring* instead and trust
// the unit tests in `test/` to keep `_handleTokenRefresh` honest.

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/core/network/api_client.dart';
import 'package:ignition_mobile/features/auth/services/auth_service.dart';

// IMPORTANT: Relative imports into `../../test/`. `package:`-style imports of
// `package:ignition_mobile/test/...` do not resolve when the on-device
// integration_test bundle is compiled (the bundle graph only includes `lib/`,
// not `test/`). Relative imports work in both the test VM and on-device.
import '../../test/fixtures/auth_fixture.dart';
import '../../test/fixtures/base_response_fixture.dart';
import '../../test/fixtures/user_fixture.dart';

import '../setup/mock_network_setup.dart';
import '../setup/test_bindings.dart';

void main() {
  ensureIntegrationBinding();

  setUpAll(() {
    // ApiClient.dio is a `late final` field. Production boots via main()
    // which calls ApiClient().initialize(); in the integration test VM
    // there is no main(), so we have to do it ourselves before any
    // service touches the client.
    if (!ApiClient.isInitialized) {
      ApiClient().initialize();
    }
  });

  tearDown(() {
    uninstallApiClientMocks();
  });

  test('ApiClient.dio has the production refresh interceptor wired', () async {
    // The InterceptorsWrapper in initialize() owns onRequest/onResponse/onError
    // and inside onError it kicks off _handleTokenRefresh on 401. If this
    // interceptor is ever removed, the wiring is broken.
    final hasWrapper = ApiClient()
        .dio
        .interceptors
        .whereType<InterceptorsWrapper>()
        .isNotEmpty;
    expect(hasWrapper, isTrue);
  });

  test('AuthService.getCurrentUser invokes GET /users/me exactly once',
      () async {
    final mock = installDefaultMock();
    mock.route(
      'GET /users/me',
      (options) => BaseResponseFixture.success(data: UserFixture.toJson()),
    );

    final response = await AuthService().getCurrentUser();
    // Tight call-count assertion so a future regression that accidentally
    // double-fires the request still trips this test.
    expect(mock.requestCount, 1);
    expect(response['id'], isNotNull);
  });

  test('Successful login returns parsed response data', () async {
    final mock = installDefaultMock();
    mock.route(
      'POST /auth/login',
      (options) => AuthFixture.loginResponse()['data'],
    );

    final response =
        await AuthService().login(AuthFixture.testEmail, AuthFixture.testPassword);

    expect(response['access_token'], AuthFixture.testAccessToken);
    expect(response['refresh_token'], AuthFixture.testRefreshToken);
  });

  test('Logout posts to /auth/logout exactly once', () async {
    final mock = installDefaultMock();
    int logoutCalls = 0;
    mock.route('POST /auth/logout', (options) {
      logoutCalls++;
      return AuthFixture.logoutResponse();
    });

    await AuthService().logout();
    expect(logoutCalls, 1);
  });

  test('Non-401 errors bubble up to the caller unchanged', () async {
    final mock = installDefaultMock();
    mock.route('GET /users/me', (options) {
      throw DioException(
        requestOptions: options,
        response: Response<dynamic>(
          requestOptions: options,
          statusCode: 500,
          data: {'error': 'server error'},
        ),
        type: DioExceptionType.badResponse,
      );
    });

    await expectLater(
      () => AuthService().getCurrentUser(),
      throwsA(isA<DioException>()),
    );
  });
}
