import 'package:drift/native.dart';
import 'package:ignition_mobile/features/notifications/data/notification_api_data_source.dart';
import 'package:ignition_mobile/features/notifications/data/notification_store.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/services/notification_center_service.dart';

/// In-memory [NotificationStore] so tests never touch the filesystem.
NotificationStore inMemoryNotificationStore() =>
    NotificationStore(executor: NativeDatabase.memory());

/// A notification with sensible defaults for tests.
AppNotification sampleNotification({
  String id = 'n1',
  String title = 'Payment received',
  String body = 'You received 10 USDC',
  DateTime? receivedAt,
  NotificationType type = NotificationType.transaction,
  String? targetId = 'tx-1',
  bool isRead = false,
  NotificationSource source = NotificationSource.push,
}) {
  return AppNotification(
    id: id,
    title: title,
    body: body,
    receivedAt: receivedAt ?? DateTime(2026, 9, 20, 14, 3),
    type: type,
    targetId: targetId,
    isRead: isRead,
    source: source,
  );
}

/// Remote data source returning a fixed list, recording how often it was hit.
class FakeNotificationRemoteDataSource implements NotificationRemoteDataSource {
  FakeNotificationRemoteDataSource([this.notifications = const []]);

  List<AppNotification> notifications;
  int callCount = 0;
  Object? error;

  @override
  Future<List<AppNotification>> fetchNotifications() async {
    callCount++;
    final failure = error;
    if (failure != null) throw failure;
    return notifications;
  }
}

/// In-memory notification stack used by the notification centre tests.
typedef NotificationServiceHarness = ({
  NotificationCenterService service,
  NotificationStore store,
  FakeNotificationRemoteDataSource remote,
});

/// Builds a [NotificationCenterService] backed by in-memory storage.
Future<NotificationServiceHarness> notificationServiceHarness({
  List<AppNotification> seed = const [],
  List<AppNotification>? remoteNotifications,
  Object? remoteError,
}) async {
  final store = inMemoryNotificationStore();
  await store.upsertAll(seed);
  final remote = FakeNotificationRemoteDataSource(
    remoteNotifications ?? const [],
  )..error = remoteError;
  return (
    service: NotificationCenterService(store: store, remote: remote),
    store: store,
    remote: remote,
  );
}
