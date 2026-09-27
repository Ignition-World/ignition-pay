import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/notifications/data/notification_store.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';

import 'helpers/notification_fakes.dart';

void main() {
  late NotificationStore store;

  setUp(() {
    store = inMemoryNotificationStore();
  });

  tearDown(() async {
    await store.close();
  });

  group('NotificationStore', () {
    test('round-trips every notification field', () async {
      final notification = sampleNotification(
        id: 'n1',
        title: 'Payment received',
        body: 'You received 10 USDC',
        type: NotificationType.transaction,
        targetId: 'tx-1',
      );

      await store.upsert(notification);
      final stored = (await store.list()).single;

      expect(stored.id, 'n1');
      expect(stored.title, 'Payment received');
      expect(stored.body, 'You received 10 USDC');
      expect(stored.receivedAt, DateTime(2026, 9, 20, 14, 3));
      expect(stored.type, NotificationType.transaction);
      expect(stored.targetId, 'tx-1');
      expect(stored.isRead, isFalse);
      expect(stored.source, NotificationSource.push);
    });

    test('lists notifications newest first', () async {
      await store.upsertAll([
        sampleNotification(id: 'old', receivedAt: DateTime(2026, 9, 18)),
        sampleNotification(id: 'new', receivedAt: DateTime(2026, 9, 20)),
        sampleNotification(id: 'mid', receivedAt: DateTime(2026, 9, 19)),
      ]);

      final ids = (await store.list()).map((n) => n.id).toList();

      expect(ids, ['new', 'mid', 'old']);
    });

    test('upsert replaces an existing row instead of duplicating it', () async {
      await store.upsert(sampleNotification(id: 'n1', title: 'First'));
      await store.upsert(sampleNotification(id: 'n1', title: 'Second'));

      final stored = await store.list();

      expect(stored, hasLength(1));
      expect(stored.single.title, 'Second');
    });

    test('upsert does not clear the read state of a known notification',
        () async {
      await store.upsert(sampleNotification(id: 'n1'));
      await store.markRead('n1');

      await store.upsert(sampleNotification(id: 'n1', title: 'Redelivered'));

      final stored = (await store.list()).single;
      expect(stored.isRead, isTrue);
      expect(stored.title, 'Redelivered');
    });

    test('unreadCount counts only unread notifications', () async {
      await store.upsertAll([
        sampleNotification(id: 'n1'),
        sampleNotification(id: 'n2'),
        sampleNotification(id: 'n3', isRead: true),
      ]);

      expect(await store.unreadCount(), 2);
    });

    test('markRead only affects the requested notification', () async {
      await store.upsertAll([
        sampleNotification(id: 'n1'),
        sampleNotification(id: 'n2'),
      ]);

      await store.markRead('n1');

      final byId = <String, AppNotification>{
        for (final notification in await store.list())
          notification.id: notification,
      };
      expect(byId['n1']!.isRead, isTrue);
      expect(byId['n2']!.isRead, isFalse);
    });

    test('markAllRead clears every unread notification', () async {
      await store.upsertAll([
        sampleNotification(id: 'n1'),
        sampleNotification(id: 'n2'),
      ]);

      await store.markAllRead();

      expect(await store.unreadCount(), 0);
    });

    test('markAllRead on an empty store is a no-op', () async {
      await store.markAllRead();

      expect(await store.list(), isEmpty);
    });

    test('remove deletes a single notification', () async {
      await store.upsertAll([
        sampleNotification(id: 'n1'),
        sampleNotification(id: 'n2'),
      ]);

      await store.remove('n1');

      expect((await store.list()).map((n) => n.id), ['n2']);
    });

    test('clear deletes every notification', () async {
      await store.upsertAll([
        sampleNotification(id: 'n1'),
        sampleNotification(id: 'n2'),
      ]);

      await store.clear();

      expect(await store.list(), isEmpty);
      expect(await store.unreadCount(), 0);
    });

    test('a null target id survives the round trip', () async {
      await store.upsert(
        sampleNotification(id: 'n1', type: NotificationType.system, targetId: null),
      );

      expect((await store.list()).single.targetId, isNull);
    });
  });
}
