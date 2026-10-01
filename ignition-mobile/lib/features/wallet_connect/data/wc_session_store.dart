import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import '../models/wc_session.dart';

class _WcSessionStoreUser extends QueryExecutorUser {
  _WcSessionStoreUser();

  @override
  int get schemaVersion => 1;

  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}

/// Drift-backed store for WalletConnect sessions.
///
/// Sessions are persisted to disk so connections survive app restarts.
/// Expired sessions are cleaned up on-read so the list always reflects
/// the active state without background tasks.
class WcSessionStore {
  WcSessionStore({QueryExecutor? executor})
      : _executor = executor ?? driftDatabase(name: 'walletconnect_sessions');

  final QueryExecutor _executor;
  bool _ready = false;

  Future<void> _ensureReady() async {
    if (_ready) return;
    await _executor.ensureOpen(_WcSessionStoreUser());
    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS wc_sessions (
        topic TEXT PRIMARY KEY NOT NULL,
        pairing_topic TEXT NOT NULL,
        peer_json TEXT NOT NULL,
        accounts_json TEXT NOT NULL,
        required_ns_json TEXT NOT NULL,
        optional_ns_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        expires_at INTEGER NOT NULL,
        disconnected_at INTEGER
      )
    ''', const <Object?>[]);
    _ready = true;
  }

  Future<void> upsert(WcSession session) async {
    await _ensureReady();
    await _executor.runCustom(
      '''
      INSERT INTO wc_sessions
        (topic, pairing_topic, peer_json, accounts_json, required_ns_json,
         optional_ns_json, status, created_at, approved_at, expires_at,
         disconnected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic) DO UPDATE SET
        pairing_topic = excluded.pairing_topic,
        peer_json = excluded.peer_json,
        accounts_json = excluded.accounts_json,
        required_ns_json = excluded.required_ns_json,
        optional_ns_json = excluded.optional_ns_json,
        status = excluded.status,
        created_at = excluded.created_at,
        approved_at = excluded.approved_at,
        expires_at = excluded.expires_at,
        disconnected_at = excluded.disconnected_at
      ''',
      session.toBindValues(),
    );
  }

  Future<void> upsertAll(Iterable<WcSession> sessions) async {
    for (final s in sessions) {
      await upsert(s);
    }
  }

  /// Returns all sessions, newest first. Expired sessions are soft-marked as
  /// expired before being returned so the UI layer never needs to check.
  Future<List<WcSession>> list() async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      '''
      SELECT topic, pairing_topic, peer_json, accounts_json, required_ns_json,
             optional_ns_json, status, created_at, approved_at, expires_at,
             disconnected_at
      FROM wc_sessions
      ORDER BY COALESCE(approved_at, created_at) DESC
      ''',
      const <Object?>[],
    );
    final now = DateTime.now();
    final result = <WcSession>[];
    for (final row in rows) {
      var session = WcSession.fromRow(row);
      if (session.status == WcSessionStatus.approved &&
          now.isAfter(session.expiresAt)) {
        session = session.copyWith(
          status: WcSessionStatus.expired,
          disconnectedAt: session.disconnectedAt ?? now,
        );
        await upsert(session);
      }
      result.add(session);
    }
    return result;
  }

  /// Only active (approved, non-expired) sessions — used by the list UI.
  Future<List<WcSession>> listActive() async {
    final all = await list();
    return <WcSession>[
      for (final s in all)
        if (s.status == WcSessionStatus.approved &&
            DateTime.now().isBefore(s.expiresAt))
          s,
    ];
  }

  Future<WcSession?> findByTopic(String topic) async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      '''
      SELECT topic, pairing_topic, peer_json, accounts_json, required_ns_json,
             optional_ns_json, status, created_at, approved_at, expires_at,
             disconnected_at
      FROM wc_sessions
      WHERE topic = ?
      LIMIT 1
      ''',
      <Object?>[topic],
    );
    if (rows.isEmpty) return null;
    return WcSession.fromRow(rows.single);
  }

  Future<void> updateStatus(
    String topic,
    WcSessionStatus status, {
    DateTime? approvedAt,
    DateTime? disconnectedAt,
  }) async {
    final current = await findByTopic(topic);
    if (current == null) return;
    final updated = current.copyWith(
      status: status,
      approvedAt: approvedAt ?? current.approvedAt,
      disconnectedAt: disconnectedAt ?? current.disconnectedAt,
    );
    await upsert(updated);
  }

  Future<void> remove(String topic) async {
    await _ensureReady();
    await _executor.runCustom(
      'DELETE FROM wc_sessions WHERE topic = ?',
      <Object?>[topic],
    );
  }

  /// Removes sessions whose hard expiry has passed. Idempotent.
  Future<void> pruneExpired() async {
    await _ensureReady();
    final cutoff = DateTime.now().millisecondsSinceEpoch;
    await _executor.runCustom(
      'DELETE FROM wc_sessions WHERE expires_at < ? AND status IN (?, ?)',
      <Object?>[
        cutoff,
        WcSessionStatus.expired.wireName,
        WcSessionStatus.disconnected.wireName,
      ],
    );
  }

  Future<void> clear() async {
    await _ensureReady();
    await _executor.runCustom(
      'DELETE FROM wc_sessions',
      const <Object?>[],
    );
  }

  Future<void> close() => _executor.close();
}
