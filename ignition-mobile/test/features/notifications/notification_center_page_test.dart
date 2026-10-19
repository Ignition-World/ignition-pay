import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ignition_mobile/core/network/api_exception.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/pages/notification_center_page.dart';

import 'helpers/notification_fakes.dart';

void main() {
  final now = DateTime(2026, 9, 20, 15);

  Widget wrap(Widget child) => MaterialApp(home: child);

  /// Router with the notification centre at `/notifications` and a stand-in
  /// transaction screen, so a tap can be asserted as real navigation.
  GoRouter routerWithNotificationCenter(
    NotificationServiceHarness harness,
  ) {
    return GoRouter(
      initialLocation: '/notifications',
      routes: [
        GoRoute(
          path: '/notifications',
          builder: (context, state) => NotificationCenterPage(
            service: harness.service,
            now: now,
          ),
        ),
        GoRoute(
          path: '/transaction/:id',
          builder: (context, state) => Scaffold(
            body: Center(child: Text('Transaction ${state.pathParameters['id']}')),
          ),
        ),
      ],
    );
  }

  group('NotificationCenterPage', () {
    testWidgets('shows an empty state when there are no notifications',
        (tester) async {
      final harness = await notificationServiceHarness();
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('notifications_empty')), findsOneWidget);
    });

    testWidgets('lists title, message and timestamp of each notification',
        (tester) async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(
            id: 'n1',
            title: 'Payment received',
            body: 'You received 10 USDC',
            receivedAt: now.subtract(const Duration(minutes: 5)),
          ),
        ],
      );
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();

      expect(find.text('Payment received'), findsOneWidget);
      expect(find.text('You received 10 USDC'), findsOneWidget);
      expect(find.text('5m ago'), findsOneWidget);
      expect(find.byKey(const Key('notification_n1')), findsOneWidget);
    });

    testWidgets('shows an unread indicator for unread notifications only',
        (tester) async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(id: 'unread'),
          sampleNotification(id: 'read', isRead: true),
        ],
      );
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('notification_unread_dot_unread')),
          findsOneWidget);
      expect(find.byKey(const Key('notification_unread_dot_read')), findsNothing);
    });

    testWidgets('tapping a notification marks it read and navigates to it',
        (tester) async {
      final harness = await notificationServiceHarness(
        seed: [sampleNotification(id: 'n1', targetId: 'tx-42')],
      );
      addTearDown(harness.service.close);
      final router = routerWithNotificationCenter(harness);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        MaterialApp.router(routerConfig: router),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('notification_n1')));
      await tester.pumpAndSettle();

      expect(find.text('Transaction tx-42'), findsOneWidget);

      final stored = await harness.service.load();
      expect(stored.single.isRead, isTrue);
      expect(harness.service.unreadCount.value, 0);
    });

    testWidgets('mark all read clears every unread indicator', (tester) async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(id: 'n1'),
          sampleNotification(id: 'n2'),
        ],
      );
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('notifications_mark_all_read')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('notification_unread_dot_n1')), findsNothing);
      expect(find.byKey(const Key('notification_unread_dot_n2')), findsNothing);
      expect(harness.service.unreadCount.value, 0);
    });

    testWidgets('mark all read is disabled when nothing is unread',
        (tester) async {
      final harness = await notificationServiceHarness(
        seed: [sampleNotification(id: 'n1', isRead: true)],
      );
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();

      final button = tester.widget<TextButton>(
        find.byKey(const Key('notifications_mark_all_read')),
      );

      expect(button.onPressed, isNull);
    });

    testWidgets('pull to refresh merges server notifications into the list',
        (tester) async {
      final harness = await notificationServiceHarness(
        remoteNotifications: [
          sampleNotification(
            id: 'remote',
            title: 'New campaign',
            receivedAt: now,
          ),
        ],
      );
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();
      expect(find.text('New campaign'), findsNothing);

      await tester.fling(
        find.byType(ListView).first,
        const Offset(0, 300),
        1000,
      );
      await tester.pumpAndSettle();

      expect(find.text('New campaign'), findsOneWidget);
    });

    testWidgets('a failed refresh keeps the stored notifications visible',
        (tester) async {
      final harness = await notificationServiceHarness(
        seed: [sampleNotification(id: 'n1', title: 'Payment received')],
        remoteError: const ServerException(),
      );
      addTearDown(harness.service.close);

      await tester.pumpWidget(
        wrap(NotificationCenterPage(service: harness.service, now: now)),
      );
      await tester.pumpAndSettle();

      await tester.fling(
        find.byKey(const Key('notifications_list')),
        const Offset(0, 300),
        1000,
      );
      await tester.pumpAndSettle();

      expect(find.text('Payment received'), findsOneWidget);
      expect(find.byKey(const Key('notifications_refresh_failed')), findsOneWidget);
    });

    testWidgets('a notification without a target only marks itself read',
        (tester) async {
      final harness = await notificationServiceHarness(
        seed: [
          sampleNotification(
            id: 'n1',
            type: NotificationType.system,
            targetId: null,
          ),
        ],
      );
      addTearDown(harness.service.close);
      final opened = <AppNotification>[];

      await tester.pumpWidget(
        wrap(
          NotificationCenterPage(
            service: harness.service,
            now: now,
            onOpen: (context, notification) => opened.add(notification),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('notification_n1')));
      await tester.pumpAndSettle();

      expect(opened.single.id, 'n1');
      expect((await harness.service.load()).single.isRead, isTrue);
    });
  });
}
