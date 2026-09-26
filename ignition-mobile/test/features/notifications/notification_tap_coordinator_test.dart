import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/services/notification_center_service.dart';
import 'package:ignition_mobile/features/notifications/services/notification_tap_coordinator.dart';

import 'helpers/notification_fakes.dart';

void main() {
  group('NotificationTapCoordinator', () {
    late List<String> navigations;

    Future<NotificationCenterService> buildService() async {
      final harness = await notificationServiceHarness();
      addTearDown(harness.service.close);
      return harness.service;
    }

    setUp(() {
      navigations = <String>[];
    });

    NotificationTapCoordinator buildCoordinator(
      NotificationCenterService service,
    ) {
      return NotificationTapCoordinator(
        service: service,
        navigate: navigations.add,
      );
    }

    test('stores the tapped notification before navigating', () async {
      final service = await buildService();
      final unreadAtNavigation = <int>[];
      final coordinator = NotificationTapCoordinator(
        service: service,
        // `record` publishes the unread count before navigation happens, so
        // observing it here proves the write landed first.
        navigate: (_) => unreadAtNavigation.add(service.unreadCount.value),
      );

      await coordinator.handleTap(
        const RemoteMessage(
          messageId: 'msg-1',
          data: {'type': 'transaction', 'targetId': 'tx-9'},
        ),
      );

      expect(unreadAtNavigation, [1]);
      expect((await service.load()).single.id, 'msg-1');
      expect((await service.load()).single.targetId, 'tx-9');
    });

    test('navigates to the transaction route for a transaction payload',
        () async {
      final service = await buildService();

      await buildCoordinator(service).handleTap(
        const RemoteMessage(
          messageId: 'msg-1',
          data: {'type': 'transaction', 'targetId': 'tx-9'},
        ),
      );

      expect(navigations, ['/transaction/tx-9']);
    });

    test('does not navigate when the payload has no target', () async {
      final service = await buildService();

      await buildCoordinator(service).handleTap(
        const RemoteMessage(
          messageId: 'msg-1',
          data: {'type': 'system'},
        ),
      );

      expect(navigations, isEmpty);
    });

    test('falls back to the notification block for the copy', () async {
      final service = await buildService();

      final stored = await buildCoordinator(service).handleTap(
        const RemoteMessage(
          messageId: 'msg-2',
          notification: RemoteNotification(
            title: 'Payment received',
            body: 'You received 10 USDC',
          ),
          data: {'type': 'transaction', 'targetId': 'tx-9'},
        ),
      );

      expect(stored!.title, 'Payment received');
      expect(stored.body, 'You received 10 USDC');
    });

    test('uses the FCM sent time as the received timestamp', () async {
      final service = await buildService();
      final sentTime = DateTime.utc(2026, 9, 20, 12);

      final stored = await buildCoordinator(service).handleTap(
        RemoteMessage(messageId: 'msg-3', sentTime: sentTime),
      );

      expect(stored!.receivedAt, sentTime);
    });

    test('a campaign notification is stored but not navigated to', () async {
      final service = await buildService();

      final stored = await buildCoordinator(service).handleTap(
        const RemoteMessage(
          messageId: 'msg-4',
          data: {'type': 'campaign', 'targetId': 'camp-1'},
        ),
      );

      expect(stored!.type, NotificationType.campaign);
      expect(navigations, isEmpty);
      expect((await service.load()).single.id, 'msg-4');
    });

    test('an empty message is ignored', () async {
      final service = await buildService();

      final stored = await buildCoordinator(service).handleTap(const RemoteMessage());

      expect(stored, isNull);
      expect(await service.load(), isEmpty);
    });

    test('a redelivered tap does not create a second entry', () async {
      final service = await buildService();
      const message = RemoteMessage(
        messageId: 'msg-5',
        data: {'type': 'transaction', 'targetId': 'tx-9'},
      );

      await buildCoordinator(service).handleTap(message);
      await buildCoordinator(service).handleTap(message);

      expect((await service.load()).single.id, 'msg-5');
    });
  });
}
