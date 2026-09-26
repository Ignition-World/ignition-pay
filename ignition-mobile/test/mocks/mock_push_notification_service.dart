import 'package:mocktail/mocktail.dart';
import 'package:ignition_mobile/core/push_notification_service.dart';

class MockPushNotificationService extends Mock
    implements PushNotificationService {}

/// Stubs all [PushNotificationService] calls to succeed silently.
///
/// Use this when push notification behaviour is not the focus of the test.
void stubPushNotificationsNoOp(MockPushNotificationService mock) {
  when(() => mock.init()).thenAnswer((_) async {});
  when(() => mock.requestPermission()).thenAnswer((_) async {});
  when(() => mock.getToken()).thenAnswer((_) async => 'mock-fcm-token');
}
