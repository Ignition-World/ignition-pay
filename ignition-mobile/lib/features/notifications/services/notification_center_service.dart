import 'package:flutter/foundation.dart';

import 'package:ignition_mobile/core/network/api_exception.dart';
import 'package:ignition_mobile/features/notifications/data/notification_api_data_source.dart';
import 'package:ignition_mobile/features/notifications/data/notification_store.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';

/// Single entry point for the in-app notification centre (#683).
///
/// Owns the local SQLite store, merges server notifications on refresh and
/// exposes an observable [unreadCount] so a home-screen badge can react to
/// read/unread changes without the page and the store knowing about each
/// other.
class NotificationCenterService {
  NotificationCenterService({
    NotificationStore? store,
    NotificationRemoteDataSource? remote,
  })  : _store = store ?? NotificationStore(),
        _remote = remote ?? ApiNotificationDataSource();

  /// Process-wide instance used by the app wiring in `main.dart`.
  static final NotificationCenterService instance = NotificationCenterService();

  final NotificationStore _store;
  final NotificationRemoteDataSource _remote;

  /// Unread notification count, updated after every mutation.
  final ValueNotifier<int> unreadCount = ValueNotifier<int>(0);

  /// True when the most recent [refresh] could not reach the server. The
  /// locally stored notifications are always returned in that case.
  bool get lastRefreshFailed => _lastRefreshFailed;
  bool _lastRefreshFailed = false;

  /// Loads every stored notification, newest first.
  Future<List<AppNotification>> load() async {
    final notifications = await _store.list();
    await _syncUnreadCount();
    return notifications;
  }

  /// Stores [notification] — a tapped push or an in-app event — and updates the
  /// unread count. Re-recording a known id refreshes its content without
  /// clearing the read state.
  Future<AppNotification> record(AppNotification notification) async {
    await _store.upsert(notification);
    await _syncUnreadCount();
    return notification;
  }

  /// Stores every notification in [notifications].
  Future<void> recordAll(Iterable<AppNotification> notifications) async {
    await _store.upsertAll(notifications);
    await _syncUnreadCount();
  }

  /// Marks a single notification read.
  Future<void> markRead(String id) async {
    await _store.markRead(id);
    await _syncUnreadCount();
  }

  /// Marks every stored notification read.
  Future<void> markAllRead() async {
    await _store.markAllRead();
    await _syncUnreadCount();
  }

  /// Pulls the server-side notifications into local storage and returns the
  /// merged list.
  ///
  /// Network and auth failures are swallowed on purpose: a failed refresh must
  /// never blank the list the user is already looking at. Inspect
  /// [lastRefreshFailed] to tell the two outcomes apart.
  Future<List<AppNotification>> refresh() async {
    try {
      await _store.upsertAll(await _remote.fetchNotifications());
      _lastRefreshFailed = false;
    } on ApiException {
      _lastRefreshFailed = true;
    }
    return load();
  }

  Future<void> _syncUnreadCount() async {
    unreadCount.value = await _store.unreadCount();
  }

  Future<void> close() => _store.close();
}
