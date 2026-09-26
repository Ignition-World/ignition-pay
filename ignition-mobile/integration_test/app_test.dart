// Single entry point (Driver) for the mobile integration test bundle.
//
// Run a specific scenario:
//   flutter test integration_test/app_test.dart -d <device> \
//       --dart-define=SCENARIO=app_launch
//
// Run every scenario (default):
//   flutter test integration_test/app_test.dart -d <device>
//
// Available scenarios:
//   - app_launch    : launch flow + GoRouter 404 handling
//   - deep_link     : ignitionpay://... / https://ignitionpay.com/...
//   - auth_flow     : token refresh on 401
//   - android       : Android-only platform driver (notification channels, FCM)
//   - ios           : iOS-only platform driver (permission flow, presentation)
//   - all           : run every suite above
//
// The integration_test runner compiles files in `integration_test/` as a
// single Flutter test bundle that is then run on the target device
// (Android emulator / iOS simulator / physical hardware).

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'platform/android_driver_test.dart' as android_driver;
import 'platform/ios_driver_test.dart' as ios_driver;
import 'scenarios/app_launch_test.dart' as app_launch;
import 'scenarios/auth_flow_test.dart' as auth_flow;
import 'scenarios/deep_link_test.dart' as deep_link;

void main() {
  // Use the integration-test-aware binding so on-device timings, screenshots
  // (via `binding.takeScreenshot()`) and accessibility semantics are wired up.
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // Run frames as close to production as possible — animations should drive
  // assertions off real elapsed time, not fakeAsync.
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  const scenario = String.fromEnvironment('SCENARIO', defaultValue: 'all');

  group('Ignition Pay — integration tests ($scenario)', () {
    if (scenario == 'all' || scenario == 'app_launch') {
      app_launch.main();
    }
    if (scenario == 'all' || scenario == 'deep_link') {
      deep_link.main();
    }
    if (scenario == 'all' || scenario == 'auth_flow') {
      auth_flow.main();
    }
    if (scenario == 'all' || scenario == 'android') {
      android_driver.main();
    }
    if (scenario == 'all' || scenario == 'ios') {
      ios_driver.main();
    }
  });
}
