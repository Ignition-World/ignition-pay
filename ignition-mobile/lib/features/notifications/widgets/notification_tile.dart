import 'package:flutter/material.dart';

import 'package:ignition_mobile/core/design_system/design_system.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/utils/notification_timestamp.dart';

/// One row in the notification centre list.
///
/// Shows the title, message, timestamp and read status; unread rows carry a
/// dot and a highlighted surface.
class NotificationTile extends StatelessWidget {
  const NotificationTile({
    super.key,
    required this.notification,
    required this.onTap,
    this.now,
  });

  final AppNotification notification;
  final VoidCallback onTap;

  /// Reference time used to render the relative timestamp. Injected by tests.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = notification.isUnread;

    return ListTile(
      key: Key('notification_${notification.id}'),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      leading: _icon(context),
      title: Text(
        notification.title,
        style: theme.textTheme.titleSmall?.copyWith(
          fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 2),
          Text(notification.body),
          const SizedBox(height: 4),
          Text(
            formatNotificationTimestamp(notification.receivedAt, now: now),
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
          ),
        ],
      ),
      trailing: unread
          ? Container(
              key: Key('notification_unread_dot_${notification.id}'),
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
              ),
            )
          : const SizedBox.shrink(),
    );
  }

  Widget _icon(BuildContext context) {
    final color =
        notification.isUnread ? AppColors.primary : AppColors.muted;

    switch (notification.type) {
      case NotificationType.transaction:
      case NotificationType.payment:
        return Icon(Icons.receipt_long, color: color);
      case NotificationType.campaign:
        return Icon(Icons.campaign_outlined, color: color);
      case NotificationType.system:
        return Icon(Icons.info_outline, color: color);
    }
  }
}
