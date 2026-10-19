import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'package:ignition_mobile/features/notifications/models/app_notification.dart';

/// Minimal [QueryExecutorUser] opening the raw-SQL notification database.
class _NotificationStoreUser extends QueryExecutorUser {
  _NotificationStoreUser();

  @override
  int get schemaVersion => 1;

  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}

/// Local, file-backed store for notification centre entries (#683).
///
/// Uses raw SQL over a drift [QueryExecutor] (mirroring `DraftStore` and
/// `BalanceCache`) so notifications survive restarts without running code
/// generation. Tests inject an in-memory executor.
///
/// The read state is deliberately *not* part of the upsert: re-delivering the
/// same notification — after a push reconnect, or a pull-to-refresh that
/// returns an already-read entry — must not resurrect it as unread.
class NotificationStore {
  NotificationStore({QueryExecutor? executor})
      : _executor = executor ?? driftDatabase(name: 'notifications');

  final QueryExecutor _executor;
  bool _ready = false;

  Future<void> _ensureReady() async {
    if (_ready) return;
    await _executor.ensureOpen(_NotificationStoreUser());
    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS app_notifications (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL,
        target_id TEXT,
        source TEXT NOT NULL
      )
    ''', const <Object?>[]);
    _ready = true;
  }

  /// Inserts [notification], or refreshes the content of an existing row while
  /// preserving its read state.
  Future<void> upsert(AppNotification notification) async {
    await _ensureReady();
    await _executor.runCustom(
      '''
      INSERT INTO app_notifications
        (id, title, body, received_at, is_read, type, target_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        received_at = excluded.received_at,
        type = excluded.type,
        target_id = excluded.target_id,
        source = excluded.source
      ''',
      notification.toBindValues(),
    );
  }

  /// Stores every notification in [notifications], newest last, de-duplicated
  /// by id.
  Future<void> upsertAll(Iterable<AppNotification> notifications) async {
    for (final notification in notifications) {
      await upsert(notification);
    }
  }

  /// Returns stored notifications, newest first.
  Future<List<AppNotification>> list({int limit = 200}) async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      '''
      SELECT id, title, body, received_at, is_read, type, target_id, source
      FROM app_notifications
      ORDER BY received_at DESC, id DESC
      LIMIT ?
      ''',
      <Object?>[limit],
    );
    return <AppNotification>[
      for (final row in rows) AppNotification.fromRow(row),
    ];
  }

  /// Number of notifications the user has not opened yet.
  Future<int> unreadCount() async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      'SELECT COUNT(*) AS unread FROM app_notifications WHERE is_read = 0',
      const <Object?>[],
    );
    return rows.single['unread']! as int;
  }

  Future<void> markRead(String id) async {
    await _ensureReady();
    await _executor.runCustom(
      'UPDATE app_notifications SET is_read = 1 WHERE id = ?',
      <Object?>[id],
    );
  }

  Future<void> markAllRead() async {
    await _ensureReady();
    await _executor.runCustom(
      'UPDATE app_notifications SET is_read = 1 WHERE is_read = 0',
      const <Object?>[],
    );
  }

  Future<void> remove(String id) async {
    await _ensureReady();
    await _executor.runCustom(
      'DELETE FROM app_notifications WHERE id = ?',
      <Object?>[id],
    );
  }

  Future<void> clear() async {
    await _ensureReady();
    await _executor.runCustom(
      'DELETE FROM app_notifications',
      const <Object?>[],
    );
  }

  Future<void> close() => _executor.close();
}
