import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:ignition_mobile/core/design_system/design_system.dart';
import 'package:ignition_mobile/features/notifications/models/app_notification.dart';
import 'package:ignition_mobile/features/notifications/services/notification_center_service.dart';
import 'package:ignition_mobile/features/notifications/widgets/notification_tile.dart';

/// In-app notification inbox (#683).
///
/// Lists every notification delivered while the app was running (push) or
/// fetched from the server, newest first. Tapping an entry marks it read and
/// then navigates to the screen it points at; pull-to-refresh merges the
/// server-side list into local storage; "Mark all read" clears the badge.
class NotificationCenterPage extends StatefulWidget {
  const NotificationCenterPage({
    super.key,
    this.service,
    this.onOpen,
    this.now,
  });

  /// Defaults to the app-wide [NotificationCenterService.instance]; injected by
  /// tests.
  final NotificationCenterService? service;

  /// Overrides the tap behaviour. Defaults to `context.go(routeLocation)`.
  final void Function(BuildContext context, AppNotification notification)?
      onOpen;

  /// Reference time used for the relative timestamps. Injected by tests.
  final DateTime? now;

  @override
  State<NotificationCenterPage> createState() => _NotificationCenterPageState();
}

class _NotificationCenterPageState extends State<NotificationCenterPage> {
  late final NotificationCenterService _service =
      widget.service ?? NotificationCenterService.instance;

  List<AppNotification> _notifications = const <AppNotification>[];
  bool _loading = true;
  bool _refreshFailed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final notifications = await _service.load();
    if (!mounted) return;
    setState(() {
      _notifications = notifications;
      _loading = false;
    });
  }

  Future<void> _refresh() async {
    final notifications = await _service.refresh();
    if (!mounted) return;
    setState(() {
      _notifications = notifications;
      _refreshFailed = _service.lastRefreshFailed;
    });
  }

  Future<void> _markAllRead() async {
    await _service.markAllRead();
    if (!mounted) return;
    setState(() {
      _notifications = <AppNotification>[
        for (final notification in _notifications)
          notification.copyWith(isRead: true),
      ];
    });
  }

  /// Marks [notification] read *before* navigating, so the entry is already in
  /// its final state when the user comes back to the list.
  Future<void> _open(AppNotification notification) async {
    await _service.markRead(notification.id);
    if (!mounted) return;
    setState(() {
      _notifications = <AppNotification>[
        for (final item in _notifications)
          if (item.id == notification.id)
            item.copyWith(isRead: true)
          else
            item,
      ];
    });

    final onOpen = widget.onOpen;
    if (onOpen != null) {
      onOpen(context, notification);
      return;
    }

    final location = notification.routeLocation;
    if (location != null) context.go(location);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          ValueListenableBuilder<int>(
            valueListenable: _service.unreadCount,
            builder: (context, unread, _) {
              return TextButton(
                key: const Key('notifications_mark_all_read'),
                onPressed: unread == 0 ? null : () => unawaited(_markAllRead()),
                child: const Text('Mark all read'),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          if (_refreshFailed)
            const _RefreshFailedBanner(
              key: Key('notifications_refresh_failed'),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: _buildList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_notifications.isEmpty) {
      return ListView(
        key: const Key('notifications_empty_list'),
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 120),
          Center(
            key: Key('notifications_empty'),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.notifications_none, size: 48, color: AppColors.muted),
                SizedBox(height: 12),
                Text('You have no notifications yet'),
              ],
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      key: const Key('notifications_list'),
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _notifications.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final notification = _notifications[index];
        return NotificationTile(
          notification: notification,
          now: widget.now,
          onTap: () => unawaited(_open(notification)),
        );
      },
    );
  }
}

/// Inline notice shown when a pull-to-refresh could not reach the server.
///
/// Deliberately not an [AppErrorBanner]: a refresh failure is not an error the
/// user caused, and it must not fire the heavy error haptic.
class _RefreshFailedBanner extends StatelessWidget {
  const _RefreshFailedBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      color: colors.errorContainer,
      padding: const EdgeInsets.all(12),
      child: const Text(
        'Could not refresh. Showing saved notifications.',
        style: TextStyle(fontSize: 13),
      ),
    );
  }
}
