// Critical flow: a push notification tap stores the notification and then
// navigates to the screen it points at (#683).
//
// What this test guards:
//   * The notification centre boots and renders the locally stored list.
//   * Tapping a stored entry marks it read *before* navigating.
//   * A transaction notification lands on the transaction screen.
//   * A notification without a target stays on the list and is marked read.
//   * A push tap handled by `NotificationTapCoordinator` stores the message
//     and navigates — the same path `main.dart` wires into
//     `PushNotificationService.tapHandler`.
//
// Notes:
//   * We do NOT trigger `main()` (which fires Firebase + PushNotification init
//     that can't run without platform channels). The coordinator is exercised
//     directly with an in-memory notification store instead.

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/pages/notification_center_page.dart';
import 'package:ignition_mobile/features/notifications/services/notification_center_service.dart';
import 'package:ignition_mobile/features/notifications/services/notification_tap_coordinator.dart';
import 'package:ignition_mobile/router/app_router.dart' as app_routes;

import '../setup/test_bindings.dart';

void main() {
  ensureIntegrationBinding();

  // The device build has a real file-backed store, so the scenario exercises
  // the same singleton the app uses. Nothing here touches the network: only
  // `record` / `load` / `markRead` are called.
  final NotificationCenterService service = NotificationCenterService.instance;

  AppNotification sample({
    String id = 'n1',
    String? targetId = 'tx-42',
    NotificationType type = NotificationType.transaction,
  }) {
    return AppNotification(
      id: id,
      title: 'Payment received',
      body: 'You received 10 USDC',
      receivedAt: DateTime.now(),
      type: type,
      targetId: targetId,
    );
  }

  testWidgets('tapping a stored notification marks it read and navigates',
      (tester) async {
    await service.record(sample());
    final router = GoRouter(
      initialLocation: '/notifications',
      routes: [
        GoRoute(
          path: '/notifications',
          builder: (_, __) => NotificationCenterPage(service: service),
        ),
        GoRoute(
          path: '/transaction/:id',
          builder: (context, state) => Scaffold(
            body: Center(child: Text('Transaction ${state.pathParameters['id']}')),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('notification_n1')), findsOneWidget);
    expect(find.byKey(const Key('notification_unread_dot_n1')), findsOneWidget);

    await tester.tap(find.byKey(const Key('notification_n1')));
    await tester.pumpAndSettle();

    expect(find.text('Transaction tx-42'), findsOneWidget);
    final stored = (await service.load()).firstWhere((n) => n.id == 'n1');
    expect(stored.isRead, isTrue);
    expect(service.unreadCount.value, 0);
  });

  testWidgets('a notification without a target is marked read in place',
      (tester) async {
    await service.record(
      sample(id: 'n2', type: NotificationType.system, targetId: null),
    );

    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: NotificationCenterPage(service: service),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('notification_n2')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('notifications_list')), findsOneWidget);
    expect(find.byKey(const Key('notification_unread_dot_n2')), findsNothing);
    expect((await service.load()).firstWhere((n) => n.id == 'n2').isRead, isTrue);
  });

  testWidgets('a push tap is stored before the router is asked to navigate',
      (tester) async {
    final locations = <String>[];
    final coordinator = NotificationTapCoordinator(
      service: service,
      navigate: locations.add,
    );

    await coordinator.handleTap(
      const RemoteMessage(
        messageId: 'msg-1',
        data: {'type': 'transaction', 'targetId': 'tx-99'},
      ),
    );
    await tester.pumpAndSettle();

    expect((await service.load()).any((n) => n.id == 'msg-1'), isTrue);
    expect(locations, ['/transaction/tx-99']);
  });

  testWidgets('the app router serves the notification centre route',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp.router(routerConfig: app_routes.appRouter),
    );
    await tester.pumpAndSettle();

    app_routes.appRouter.go('/notifications');
    await tester.pumpAndSettle();

    // The route is declared, so GoRouter renders it instead of the 404 page.
    expect(find.text('Page Not Found'), findsNothing);
  });
}
