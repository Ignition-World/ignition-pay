import 'package:firebase_messaging/firebase_messaging.dart';

import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/services/notification_center_service.dart';

/// Turns a tapped push message into a stored notification and only then
/// navigates (#683).
///
/// Ordering matters: if the app is opened from a terminated state the user
/// lands on the notification centre, and the entry they just tapped has to be
/// there — read — before any navigation happens.
class NotificationTapCoordinator {
  NotificationTapCoordinator({
    required NotificationCenterService service,
    required void Function(String location) navigate,
  })  : _service = service,
        _navigate = navigate;

  final NotificationCenterService _service;
  final void Function(String location) _navigate;

  /// Stores [message] and navigates to the screen it points at.
  ///
  /// Returns the notification that was stored, or `null` when the message
  /// carried neither a message id nor a payload to build one from.
  Future<AppNotification?> handleTap(RemoteMessage message) async {
    final notification = _fromMessage(message);
    if (notification == null) return null;

    await _service.record(notification);

    final location = notification.routeLocation;
    if (location != null) _navigate(location);

    return notification;
  }

  /// Maps an FCM message onto the local model.
  ///
  /// `data` wins over the `notification` block so a campaign or transaction
  /// id delivered as data is never lost, and the notification block is used for
  /// the human-readable copy when `data` omits it.
  AppNotification? _fromMessage(RemoteMessage message) {
    final data = Map<String, dynamic>.from(message.data);
    final notification = message.notification;

    final payload = <String, dynamic>{
      ...data,
      if (data['title'] == null && notification?.title != null)
        'title': notification!.title,
      if (data['body'] == null && notification?.body != null)
        'body': notification!.body,
    };

    if (payload.isEmpty && message.messageId == null) return null;

    return AppNotification.fromPayload(
      payload,
      id: message.messageId,
      receivedAt: message.sentTime,
    );
  }
}
