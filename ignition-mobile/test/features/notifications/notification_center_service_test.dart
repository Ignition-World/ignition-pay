import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/network/api_exception.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';

import 'helpers/notification_fakes.dart';

void main() {
  group('NotificationCenterService', () {
    test('load returns stored notifications newest first', () async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(id: 'old', receivedAt: DateTime(2026, 9, 18)),
          sampleNotification(id: 'new', receivedAt: DateTime(2026, 9, 20)),
        ],
      );
      addTearDown(harness.service.close);

      final notifications = await harness.service.load();

      expect(notifications.map((n) => n.id), ['new', 'old']);
    });

    test('load publishes the unread count', () async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(id: 'n1'),
          sampleNotification(id: 'n2', isRead: true),
        ],
      );
      addTearDown(harness.service.close);

      await harness.service.load();

      expect(harness.service.unreadCount.value, 1);
    });

    test('record stores a push notification and bumps the unread count',
        () async {
      final harness = await notificationServiceHarness();
      addTearDown(harness.service.close);

      await harness.service.record(sampleNotification(id: 'n1'));

      expect((await harness.service.load()).single.id, 'n1');
      expect(harness.service.unreadCount.value, 1);
    });

    test('record does not resurrect an already read notification as unread',
        () async {
      final harness = await notificationServiceHarness(
        seed: [sampleNotification(id: 'n1')],
      );
      addTearDown(harness.service.close);
      await harness.service.markRead('n1');

      await harness.service.record(sampleNotification(id: 'n1'));

      expect(harness.service.unreadCount.value, 0);
    });

    test('markRead clears the unread count for that notification', () async {
      final harness = await notificationServiceHarness(
        seed: [sampleNotification(id: 'n1')],
      );
      addTearDown(harness.service.close);

      await harness.service.markRead('n1');

      expect(harness.service.unreadCount.value, 0);
    });

    test('markAllRead clears every unread notification', () async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(id: 'n1'),
          sampleNotification(id: 'n2'),
        ],
      );
      addTearDown(harness.service.close);

      await harness.service.markAllRead();

      expect(harness.service.unreadCount.value, 0);
      expect(
        (await harness.service.load()).every((n) => n.isRead),
        isTrue,
      );
    });

    group('refresh', () {
      test('merges server notifications into local storage', () async {
        final harness = await notificationServiceHarness(
          seed: [sampleNotification(id: 'local')],
          remoteNotifications: [
            sampleNotification(
              id: 'remote',
              source: NotificationSource.server,
              receivedAt: DateTime(2026, 9, 21),
            ),
          ],
        );
        addTearDown(harness.service.close);

        final notifications = await harness.service.refresh();

        expect(notifications.map((n) => n.id), ['remote', 'local']);
        expect(harness.service.lastRefreshFailed, isFalse);
      });

      test('keeps a locally read notification read after a refresh', () async {
        final harness = await notificationServiceHarness(
          seed: [sampleNotification(id: 'n1')],
          remoteNotifications: [sampleNotification(id: 'n1')],
        );
        addTearDown(harness.service.close);
        await harness.service.markRead('n1');

        await harness.service.refresh();

        expect((await harness.service.load()).single.isRead, isTrue);
      });

      test('returns local data and flags the failure when the server errors',
          () async {
        final harness = await notificationServiceHarness(
          seed: [sampleNotification(id: 'local')],
          remoteError: const ServerException(),
        );
        addTearDown(harness.service.close);

        final notifications = await harness.service.refresh();

        expect(notifications.map((n) => n.id), ['local']);
        expect(harness.service.lastRefreshFailed, isTrue);
      });

      test('hitting the server again after a failure clears the flag',
          () async {
        final harness = await notificationServiceHarness(
          remoteNotifications: [sampleNotification(id: 'remote')],
        );
        addTearDown(harness.service.close);
        harness.remote.error = const ServerException();
        await harness.service.refresh();
        expect(harness.service.lastRefreshFailed, isTrue);

        harness.remote.error = null;
        await harness.service.refresh();

        expect(harness.service.lastRefreshFailed, isFalse);
      });
    });
  });
}
