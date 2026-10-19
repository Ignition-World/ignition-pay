/// What a notification is about, used to pick the icon and the screen a tap
/// opens.
enum NotificationType {
  transaction,
  campaign,
  payment,
  system;

  /// Parses a wire value, falling back to [NotificationType.system] for
  /// anything unknown so a new backend type can never crash the list.
  static NotificationType parse(String? raw) {
    for (final type in NotificationType.values) {
      if (type.wireName == raw) return type;
    }
    return NotificationType.system;
  }

  String get wireName => name;
}

/// Where a stored notification originally came from.
enum NotificationSource {
  push,
  inApp,
  server;

  static NotificationSource parse(String? raw) {
    for (final source in NotificationSource.values) {
      if (source.wireName == raw) return source;
    }
    return NotificationSource.server;
  }

  String get wireName => name;
}

/// A single entry in the in-app notification centre (#683).
///
/// The model is deliberately free of Flutter, Firebase and Drift imports so it
/// can be built from any source — a tapped FCM message, the dashboard payload
/// returned by `GET /users/me/dashboard`, or an in-app event — and so unit
/// tests never need platform channels.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.receivedAt,
    required this.type,
    this.targetId,
    this.isRead = false,
    this.source = NotificationSource.push,
  });

  /// Stable, de-duplicated identifier. For push messages this is the FCM
  /// `messageId`; for server notifications it is the backend id.
  final String id;
  final String title;
  final String body;
  final DateTime receivedAt;
  final NotificationType type;

  /// Id of the record the notification points at (transaction id, …).
  final String? targetId;
  final bool isRead;
  final NotificationSource source;

  bool get isUnread => !isRead;

  /// The in-app location a tap should open, or `null` when the notification
  /// has no dedicated screen.
  ///
  /// Only routes the app actually declares are returned, so a tap can never
  /// land the user on the router's "Page Not Found" screen. Campaign
  /// notifications have no detail screen yet and therefore return `null`; the
  /// tap simply marks the notification read.
  String? get routeLocation {
    final target = targetId;
    if (target == null || target.isEmpty) return null;

    switch (type) {
      case NotificationType.transaction:
      case NotificationType.payment:
        return '/transaction/$target';
      case NotificationType.campaign:
      case NotificationType.system:
        return null;
    }
  }

  AppNotification copyWith({
    String? title,
    String? body,
    DateTime? receivedAt,
    NotificationType? type,
    String? targetId,
    bool? isRead,
    NotificationSource? source,
  }) {
    return AppNotification(
      id: id,
      title: title ?? this.title,
      body: body ?? this.body,
      receivedAt: receivedAt ?? this.receivedAt,
      type: type ?? this.type,
      targetId: targetId ?? this.targetId,
      isRead: isRead ?? this.isRead,
      source: source ?? this.source,
    );
  }

  /// Builds a notification from a raw payload — an FCM `data` map, or a
  /// dashboard notification object.
  ///
  /// Keys are read leniently (`title` / `body` / `message`, `id` /
  /// `notificationId`, `type`, `targetId` / `transactionId`) so both the push
  /// and the server shape map onto the same model.
  factory AppNotification.fromPayload(
    Map<String, dynamic> payload, {
    String? id,
    DateTime? receivedAt,
    DateTime? now,
    NotificationSource source = NotificationSource.push,
    String fallbackId = 'unknown',
  }) {
    final fallback = now ?? DateTime.now();
    return AppNotification(
      id: _firstString(payload, const ['id', 'notificationId', 'messageId']) ??
          id ??
          fallbackId,
      title: _firstString(payload, const ['title', 'heading']) ?? 'Ignition Pay',
      body: _firstString(payload, const ['body', 'message', 'text']) ?? '',
      receivedAt: _parseTimestamp(payload) ??
          _parseSentTime(payload) ??
          receivedAt ??
          fallback,
      type: NotificationType.parse(_firstString(payload, const ['type'])),
      targetId: _firstString(payload, const ['targetId', 'transactionId']),
      source: source,
    );
  }

  /// Rebuilds a notification from a row produced by the notification store.
  factory AppNotification.fromRow(Map<String, dynamic> row) {
    return AppNotification(
      id: row['id']! as String,
      title: row['title']! as String,
      body: row['body']! as String,
      receivedAt:
          DateTime.fromMillisecondsSinceEpoch(row['received_at']! as int),
      isRead: (row['is_read']! as int) == 1,
      type: NotificationType.parse(row['type'] as String?),
      targetId: row['target_id'] as String?,
      source: NotificationSource.parse(row['source'] as String?),
    );
  }

  /// SQL bind values, in the order declared by [_toRowSql].
  List<Object?> toBindValues() => <Object?>[
        id,
        title,
        body,
        receivedAt.millisecondsSinceEpoch,
        isRead ? 1 : 0,
        type.wireName,
        targetId,
        source.wireName,
      ];

  @override
  String toString() =>
      'AppNotification($id, $type, read: $isRead, at: $receivedAt)';
}

String? _firstString(Map<String, dynamic> payload, List<String> keys) {
  for (final key in keys) {
    final value = payload[key];
    if (value is String && value.isNotEmpty) return value;
  }
  return null;
}

/// Accepts either epoch milliseconds/seconds or an ISO-8601 string.
DateTime? _parseTimestamp(Map<String, dynamic> payload) {
  for (final key in const ['receivedAt', 'createdAt', 'timestamp']) {
    final value = payload[key];
    if (value is int) {
      // Heuristic: values below ~1e11 are second-resolution epochs.
      return DateTime.fromMillisecondsSinceEpoch(
        value < 100000000000 ? value * 1000 : value,
      );
    }
    if (value is String) {
      final parsed = DateTime.tryParse(value);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

DateTime? _parseSentTime(Map<String, dynamic> payload) {
  final value = payload['sentTime'];
  if (value is String) return DateTime.tryParse(value);
  return null;
}
