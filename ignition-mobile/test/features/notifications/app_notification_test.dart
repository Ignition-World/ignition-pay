import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/utils/notification_timestamp.dart';

void main() {
  group('AppNotification.fromPayload', () {
    test('reads the FCM data shape', () {
      final notification = AppNotification.fromPayload(
        const {
          'title': 'Payment received',
          'body': 'You received 10 USDC',
          'type': 'transaction',
          'targetId': 'tx-1',
        },
        id: 'msg-1',
      );

      expect(notification.id, 'msg-1');
      expect(notification.title, 'Payment received');
      expect(notification.body, 'You received 10 USDC');
      expect(notification.type, NotificationType.transaction);
      expect(notification.targetId, 'tx-1');
      expect(notification.isRead, isFalse);
    });

    test('prefers an id carried by the payload over the fallback', () {
      final notification = AppNotification.fromPayload(
        const {'id': 'from-payload'},
        id: 'msg-1',
      );

      expect(notification.id, 'from-payload');
    });

    test('falls back to a default title and empty body', () {
      final notification = AppNotification.fromPayload(const {}, id: 'msg-1');

      expect(notification.title, 'Ignition Pay');
      expect(notification.body, isEmpty);
    });

    test('an unknown type is stored as a system notification', () {
      final notification = AppNotification.fromPayload(
        const {'type': 'quantum_settlement'},
        id: 'msg-1',
      );

      expect(notification.type, NotificationType.system);
    });

    test('parses a millisecond epoch timestamp', () {
      final notification = AppNotification.fromPayload(
        const {'timestamp': 1790000000000},
        id: 'msg-1',
      );

      expect(
        notification.receivedAt,
        DateTime.fromMillisecondsSinceEpoch(1790000000000),
      );
    });

    test('parses a second-resolution epoch timestamp', () {
      final notification = AppNotification.fromPayload(
        const {'createdAt': 1790000000},
        id: 'msg-1',
      );

      expect(
        notification.receivedAt,
        DateTime.fromMillisecondsSinceEpoch(1790000000000),
      );
    });

    test('parses an ISO-8601 timestamp', () {
      final notification = AppNotification.fromPayload(
        const {'createdAt': '2026-09-20T14:03:00Z'},
        id: 'msg-1',
      );

      expect(notification.receivedAt.toUtc(), DateTime.utc(2026, 9, 20, 14, 3));
    });

    test('falls back to now when the payload carries no timestamp', () {
      final now = DateTime(2026, 9, 20, 12);

      final notification = AppNotification.fromPayload(
        const {},
        id: 'msg-1',
        now: now,
      );

      expect(notification.receivedAt, now);
    });
  });

  group('AppNotification.routeLocation', () {
    test('a transaction notification points at the transaction screen', () {
      final notification = sampleNotificationWith(
        type: NotificationType.transaction,
        targetId: 'tx-1',
      );

      expect(notification.routeLocation, '/transaction/tx-1');
    });

    test('a payment notification points at the transaction screen', () {
      final notification = sampleNotificationWith(
        type: NotificationType.payment,
        targetId: 'tx-1',
      );

      expect(notification.routeLocation, '/transaction/tx-1');
    });

    test('a campaign notification has no route yet', () {
      final notification = sampleNotificationWith(
        type: NotificationType.campaign,
        targetId: 'camp-1',
      );

      expect(notification.routeLocation, isNull);
    });

    test('a notification without a target has no route', () {
      final notification = sampleNotificationWith(
        type: NotificationType.transaction,
        targetId: null,
      );

      expect(notification.routeLocation, isNull);
    });
  });

  group('formatNotificationTimestamp', () {
    final now = DateTime(2026, 9, 20, 15, 30);

    test('renders sub-minute ages as "Just now"', () {
      expect(
        formatNotificationTimestamp(now.subtract(const Duration(seconds: 20)),
            now: now),
        'Just now',
      );
    });

    test('renders minutes', () {
      expect(
        formatNotificationTimestamp(now.subtract(const Duration(minutes: 7)),
            now: now),
        '7m ago',
      );
    });

    test('renders hours', () {
      expect(
        formatNotificationTimestamp(now.subtract(const Duration(hours: 3)),
            now: now),
        '3h ago',
      );
    });

    test('renders days', () {
      expect(
        formatNotificationTimestamp(now.subtract(const Duration(days: 2)),
            now: now),
        '2d ago',
      );
    });

    test('renders an absolute date beyond a week', () {
      expect(
        formatNotificationTimestamp(DateTime(2026, 9, 1, 9, 5), now: now),
        'Sep 1, 09:05',
      );
    });

    test('renders a future timestamp as an absolute date', () {
      expect(
        formatNotificationTimestamp(DateTime(2026, 9, 21, 8, 7), now: now),
        'Sep 21, 08:07',
      );
    });
  });
}

AppNotification sampleNotificationWith({
  required NotificationType type,
  required String? targetId,
}) {
  return AppNotification(
    id: 'n1',
    title: 'Title',
    body: 'Body',
    receivedAt: DateTime(2026, 9, 20),
    type: type,
    targetId: targetId,
  );
}
