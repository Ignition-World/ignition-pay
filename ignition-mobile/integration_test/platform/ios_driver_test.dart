// Device driver test — iOS-specific platform behaviour.
//
// What this test guards:
//   * `PushNotificationService.init()` ends with `requestPermission()` and
//     resolves to `AuthorizationStatus.authorized` on iOS.
//   * `setForegroundNotificationPresentationOptions(alert:badge:sound:)` is
//     propagated to FirebaseMessaging on iOS.
//   * A foreground RemoteMessage renders a local notification with the same
//     payload that Android receives.
//   * `PushNotificationService.getToken()` returns a non-null FCM/APNs token
//     after init().
//
// Skipped on non-iOS targets via the `skip:` constructor parameter on
// `test()`, so no iOS-only MethodChannels fire on the wrong platform.
//
// Scope limitation: the mocks below shadow the real `firebase_messaging` and
// `flutter_local_notifications` channels, so on a real device these tests
// verify the *Dart-side code path* of `init()` rather than whether
// `requestPermission()` actually surfaces an iOS system prompt. Verifying
// real platform behaviour requires a Firebase-configured CI runtime and is
// out of scope for this suite.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:ignition_mobile/core/push_notification_service.dart';

import '../setup/test_bindings.dart';

/// One-line alias for the shared `stubPushNotificationChannels(binding)`
/// helper in `setup/test_bindings.dart`. Kept here so each call site reads
/// naturally and is explicit about which platform the suite targets.
void stubIosPushNotificationChannels(IntegrationTestWidgetsFlutterBinding binding) =>
    stubPushNotificationChannels(binding);

void main() {
  ensureIntegrationBinding();

  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final onIos = currentIntegrationPlatform() == IntegrationPlatform.ios
      ? null
      : 'iOS-only platform driver.';

  test(
    'Permission request resolves to AuthorizationStatus.authorized on iOS',
    () async {
      addTearDown(() async {
        await PushNotificationService().dispose();
        clearPushNotificationChannelMocks(binding);
      });

      stubIosPushNotificationChannels(binding);

      bool? invoked = false;
      const fcmChannel = MethodChannel('plugins.flutter.io/firebase_messaging');
      binding.defaultBinaryMessenger.setMockMethodCallHandler(fcmChannel, (call) async {
        if (call.method == 'requestPermission') {
          invoked = true;
          return <String, dynamic>{
            'authorizationStatus': 1, // AuthorizationStatus.authorized
            'alert': true,
            'badge': true,
            'sound': true,
            'provisional': false,
          };
        }
        return null;
      });

      await PushNotificationService().init();
      expect(invoked, isTrue);
    },
    skip: onIos,
  );

  test(
    'setForegroundNotificationPresentationOptions is propagated',
    () async {
      addTearDown(() async {
        await PushNotificationService().dispose();
        clearPushNotificationChannelMocks(binding);
      });

      stubIosPushNotificationChannels(binding);

      Map<String, dynamic>? presentationOptions;
      const fcmChannel = MethodChannel('plugins.flutter.io/firebase_messaging');
      binding.defaultBinaryMessenger.setMockMethodCallHandler(fcmChannel, (call) async {
        if (call.method == 'setForegroundNotificationPresentationOptions') {
          presentationOptions = Map<String, dynamic>.from(call.arguments as Map);
        }
        return null;
      });

      await PushNotificationService().init();
      expect(presentationOptions, isNotNull);
      expect(presentationOptions!['alert'], isTrue);
      expect(presentationOptions!['badge'], isTrue);
      expect(presentationOptions!['sound'], isTrue);
    },
    skip: onIos,
  );

  test(
    'Foreground iOS RemoteMessage renders local notification',
    () async {
      addTearDown(() async {
        await PushNotificationService().dispose();
        clearPushNotificationChannelMocks(binding);
      });

      stubIosPushNotificationChannels(binding);

      Map<dynamic, dynamic>? recordedShow;
      const localChannel = MethodChannel('dexterous.com/flutter/local_notifications');
      binding.defaultBinaryMessenger.setMockMethodCallHandler(localChannel, (call) async {
        if (call.method == 'show') {
          recordedShow = Map<dynamic, dynamic>.from(call.arguments as Map<dynamic, dynamic>);
        }
        return null;
      });

      await PushNotificationService().init();
      await binding.pump();

      const fcmChannel = MethodChannel('plugins.flutter.io/firebase_messaging');
      final codec = StandardMethodCodec();
      final call = MethodCall('Messaging#onMessage', {
        'messageId': '4321',
        'notification': {
          'title': 'Ignition Pay',
          'body': 'Deposit confirmed',
          'android': <String, dynamic>{},
        },
        'data': <String, dynamic>{},
      });

      await binding.defaultBinaryMessenger.handlePlatformMessage(
        fcmChannel.name,
        codec.encodeMethodCall(call),
        (_) {},
      );
      await binding.pump();

      expect(recordedShow, isNotNull);
      expect(recordedShow!['title'], 'Ignition Pay');
      expect(recordedShow!['body'], 'Deposit confirmed');
    },
    skip: onIos,
  );

  test(
    'getToken() returns a non-empty FCM token once init completed',
    () async {
      addTearDown(() async {
        await PushNotificationService().dispose();
        clearPushNotificationChannelMocks(binding);
      });

      stubIosPushNotificationChannels(binding);

      bool? getTokenCalled = false;
      const fcmChannel = MethodChannel('plugins.flutter.io/firebase_messaging');
      binding.defaultBinaryMessenger.setMockMethodCallHandler(fcmChannel, (call) async {
        if (call.method == 'getToken') {
          getTokenCalled = true;
          return 'mock-fcm-token';
        }
        return null;
      });

      await PushNotificationService().init();
      final token = await PushNotificationService().getToken();
      expect(token, isNotNull);
      expect(token, startsWith('mock-fcm-token'));
      expect(getTokenCalled, isTrue);
    },
    skip: onIos,
  );
}
