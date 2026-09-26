// Test bindings used by every scenario / platform driver.
//
// Centralising initialisation here means each scenario file doesn't have to
// remember to call `IntegrationTestWidgetsFlutterBinding.ensureInitialized()`
// or wire up Firebase mocks before pumping the widget tree.

import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:integration_test/integration_test.dart';

/// Enum for the on-device platform hosting the integration test bundle.
enum IntegrationPlatform { android, ios, other }

/// Detects the current platform running the integration test.
///
/// Defaults to [IntegrationPlatform.other] when running on the host VM
/// (e.g. `flutter test integration_test/app_test.dart` without `-d`).
IntegrationPlatform currentIntegrationPlatform() {
  if (!kIsWeb && Platform.isAndroid) return IntegrationPlatform.android;
  if (!kIsWeb && Platform.isIOS) return IntegrationPlatform.ios;
  return IntegrationPlatform.other;
}

/// Ensures the integration-aware Flutter binding is installed.
///
/// Idempotent — calling it more than once returns the same instance.
IntegrationTestWidgetsFlutterBinding ensureIntegrationBinding() {
  return IntegrationTestWidgetsFlutterBinding.ensureInitialized();
}

/// Registers inert push-notification mocks on both the
/// `firebase_messaging` and `flutter_local_notifications` channels. Call this
/// *before* `PushNotificationService().init()` so init()'s platform
/// permission / channel-creation / presentation-options calls land in the
/// mock. Per-test assertions can override the mock after calling this helper.
void stubPushNotificationChannels(IntegrationTestWidgetsFlutterBinding binding) {
  const localChannel = MethodChannel('dexterous.com/flutter/local_notifications');
  const fcmChannel = MethodChannel('plugins.flutter.io/firebase_messaging');

  binding.defaultBinaryMessenger.setMockMethodCallHandler(localChannel, (call) async {
    if (call.method == 'initialize' ||
        call.method == 'createNotificationChannel' ||
        call.method == 'show') {
      return true;
    }
    return null;
  });

  binding.defaultBinaryMessenger.setMockMethodCallHandler(fcmChannel, (call) async {
    if (call.method == 'requestPermission') {
      return <String, dynamic>{
        'authorizationStatus': 1, // AuthorizationStatus.authorized
        'alert': true,
        'badge': true,
        'sound': true,
        'provisional': false,
      };
    }
    if (call.method == 'getToken') return 'mock-fcm-token';
    if (call.method == 'getAPNSToken') return 'mock-apns-token';
    if (call.method == 'initialize' ||
        call.method == 'setBackgroundMessageHandler' ||
        call.method == 'setForegroundNotificationPresentationOptions' ||
        call.method == 'hasBackgroundHandlerRegistered') {
      return true;
    }
    return null;
  });
}

/// Clears every push-notification mock handler installed on the binary
/// messenger. Call this from each push-notification-related test's
/// `addTearDown` to prevent the next test from inheriting a stale handler.
void clearPushNotificationChannelMocks(IntegrationTestWidgetsFlutterBinding binding) {
  const localChannel = MethodChannel('dexterous.com/flutter/local_notifications');
  const fcmChannel = MethodChannel('plugins.flutter.io/firebase_messaging');
  binding.defaultBinaryMessenger.setMockMethodCallHandler(localChannel, null);
  binding.defaultBinaryMessenger.setMockMethodCallHandler(fcmChannel, null);
}
