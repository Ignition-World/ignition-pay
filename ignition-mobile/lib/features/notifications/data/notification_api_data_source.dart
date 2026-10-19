import 'package:ignition_mobile/core/network/api_client.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';

/// Server-side source of notifications, so the notification centre can be
/// refreshed with pull-to-refresh.
abstract interface class NotificationRemoteDataSource {
  /// Returns the notifications the server currently knows about, newest first.
  Future<List<AppNotification>> fetchNotifications();
}

/// Reads notifications from the dashboard payload served by
/// `GET /users/me/dashboard` (`unreadNotifications`), the same slice the Home
/// page already consumes.
class ApiNotificationDataSource implements NotificationRemoteDataSource {
  ApiNotificationDataSource({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  @override
  Future<List<AppNotification>> fetchNotifications() async {
    final response = await _apiClient.get<dynamic>('/users/me/dashboard');
    final payload = response.data;
    if (payload is! Map<String, dynamic>) return const <AppNotification>[];

    final raw = payload['unreadNotifications'];
    if (raw is! List<dynamic>) return const <AppNotification>[];

    return <AppNotification>[
      for (final item in raw)
        if (item is Map<String, dynamic>)
          AppNotification.fromPayload(
            item,
            source: NotificationSource.server,
          ),
    ];
  }
}
