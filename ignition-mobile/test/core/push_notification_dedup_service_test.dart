import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/push_notification_service.dart';

void main() {
  final service = PushNotificationService();

  setUp(service.resetDedup);

  group('PushNotificationService delivery gate', () {
    test('the first delivery of a message is accepted', () {
      expect(
        service.acceptDelivery(const RemoteMessage(messageId: 'msg-1')),
        isTrue,
      );
    });

    test('a redelivery of the same message is rejected', () {
      service.acceptDelivery(const RemoteMessage(messageId: 'msg-1'));

      expect(
        service.acceptDelivery(const RemoteMessage(messageId: 'msg-1')),
        isFalse,
      );
    });

    test('a message delivered from a terminated and a background state is only handled once',
        () {
      // getInitialMessage and onMessageOpenedApp can both deliver the same
      // message; the gate must let only the first one through.
      const fromTerminated = RemoteMessage(messageId: 'msg-1');
      const fromBackground = RemoteMessage(messageId: 'msg-1');

      expect(service.acceptDelivery(fromTerminated), isTrue);
      expect(service.acceptDelivery(fromBackground), isFalse);
      expect(service.dedupWindow, ['id:msg-1']);
    });

    test('the dedup window is bounded to 100 events', () {
      for (var i = 0; i < 250; i++) {
        service.acceptDelivery(RemoteMessage(messageId: 'msg-$i'));
      }

      expect(service.dedupWindow, hasLength(100));
      expect(service.dedupWindow.last, 'id:msg-249');
      expect(service.dedupWindow, isNot(contains('id:msg-0')));
    });

    test('resetDedup forgets everything, as an app restart would', () {
      service.acceptDelivery(const RemoteMessage(messageId: 'msg-1'));
      service.resetDedup();

      expect(service.dedupWindow, isEmpty);
      expect(
        service.acceptDelivery(const RemoteMessage(messageId: 'msg-1')),
        isTrue,
      );
    });

    test('data-only messages are de-duplicated by content', () {
      RemoteMessage build(String body) => RemoteMessage(
            sentTime: DateTime.utc(2026, 9, 26, 12),
            notification: RemoteNotification(title: 'Alert', body: body),
          );

      expect(service.acceptDelivery(build('same')), isTrue);
      expect(service.acceptDelivery(build('same')), isFalse);
      expect(service.acceptDelivery(build('different')), isTrue);
    });
  });
}
