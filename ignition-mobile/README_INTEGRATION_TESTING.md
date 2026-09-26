# Integration testing — `ignition_mobile`

This directory holds on-device end-to-end tests for the Ignition Mobile Flutter
app. Tests are executed on a real Android emulator / iOS simulator / physical
device by `flutter test integration_test/...`.

## Layout

```
integration_test/
├── app_test.dart                  # single driver entry-point (SCENARIO dispatch)
├── setup/
│   ├── test_bindings.dart         # integration bindings + shareable teardown helpers
│   └── mock_network_setup.dart    # Dio MockInterceptor + ApiClient wiring
├── scenarios/
│   ├── app_launch_test.dart       # boot + GoRouter 404 + dryRun of declared paths
│   ├── deep_link_test.dart        # ignitionpay:// + https://ignitionpay.com/...
│   └── auth_flow_test.dart        # AuthService contract via mocked Dio
└── platform/
    ├── android_driver_test.dart   # notification channel + FCM background + foreground
    └── ios_driver_test.dart       # permission flow + presentation + token
```

## Run a specific scenario

```bash
flutter test integration_test/app_test.dart \
    -d <device-id> \
    --dart-define=SCENARIO=app_launch
```

Available scenarios: `app_launch`, `deep_link`, `auth_flow`, `android`, `ios`,
or `all` (default).

## Run everything

```bash
flutter test integration_test/app_test.dart -d <device-id>
```

## Notes & caveats

- The `auth_flow_test` does **not** exercise the live 401 → `/auth/refresh` →
  retry round-trip because production builds a fresh `Dio` instance for the
  refresh call, and that second Dio is unreachable from the
  `MockInterceptor`. We assert the wiring contract (production
  `InterceptorsWrapper` is installed on `ApiClient().dio`) instead, and rely
  on backend integration tests to verify the full refresh flow.
- `deep_link_test` drives GoRouter directly with the deep-link-shaped URIs
  (`ignitionpay://...`) the future `app_links` receiver will forward to
  GoRouter. Once `main.dart` wires the `app_links` package, the test should
  be extended to drive the platform channel directly — see the
  `// FUTURE: platform channel` comment.
- `android_driver_test` and `ios_driver_test` skip their entire body on the
  wrong platform via the `test(..., skip: …)` constructor parameter so no
  platform-only MethodChannels ever fire on the host VM.
- The accompanying GitHub Actions workflow at
  `.github/workflows/integration-test.yml` runs the Android matrix on
  `ubuntu-latest` with `reactivecircus/android-emulator-runner`. Note that
  this action requires KVM acceleration, which is **not available** on
  standard GitHub-hosted runners — the job will need a self-hosted runner
  with `linux-kvm` labels before the matrix can turn green. iOS jobs run on
  `macos-latest`.
