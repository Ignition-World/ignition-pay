import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'transaction_draft.dart';

/// Minimal [QueryExecutorUser] opening the raw-SQL draft database.
class _DraftStoreUser extends QueryExecutorUser {
  _DraftStoreUser();

  @override
  int get schemaVersion => 1;

  @override
  Future<void> beforeOpen(
    QueryExecutor executor,
    OpeningDetails details,
  ) async {}
}

/// Local, file-backed store for offline send drafts.
///
/// Uses raw SQL over a drift [QueryExecutor] (mirroring `BalanceCache`) so
/// drafts survive restarts without running code generation. Tests inject an
/// in-memory executor.
class DraftStore {
  DraftStore({QueryExecutor? executor})
      : _executor = executor ?? driftDatabase(name: 'transaction_drafts');

  final QueryExecutor _executor;
  bool _ready = false;

  Future<void> _ensureReady() async {
    if (_ready) return;
    await _executor.ensureOpen(_DraftStoreUser());
    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS transaction_drafts (
        id TEXT PRIMARY KEY NOT NULL,
        recipient TEXT NOT NULL,
        amount TEXT NOT NULL,
        asset TEXT NOT NULL,
        memo TEXT,
        fee_estimate TEXT,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        last_attempt_at INTEGER,
        error_message TEXT
      )
    ''', const <Object?>[]);
    _ready = true;
  }

  /// Inserts or replaces [draft].
  Future<void> save(TransactionDraft draft) async {
    await _ensureReady();
    await _executor.runCustom(
      '''
      INSERT OR REPLACE INTO transaction_drafts
        (id, recipient, amount, asset, memo, fee_estimate, created_at,
         status, last_attempt_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ''',
      <Object?>[
        draft.id,
        draft.recipient,
        draft.amount,
        draft.asset,
        draft.memo,
        draft.feeEstimate,
        draft.createdAt.millisecondsSinceEpoch,
        draft.status.wireName,
        draft.lastAttemptAt?.millisecondsSinceEpoch,
        draft.errorMessage,
      ],
    );
  }

  /// Returns the draft with [id], or null when it does not exist.
  Future<TransactionDraft?> find(String id) async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      'SELECT * FROM transaction_drafts WHERE id = ?',
      <Object?>[id],
    );
    if (rows.isEmpty) return null;
    return _fromRow(rows.single);
  }

  /// All drafts, newest first.
  Future<List<TransactionDraft>> all() async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      'SELECT * FROM transaction_drafts ORDER BY created_at DESC',
      const <Object?>[],
    );
    return rows.map(_fromRow).toList();
  }

  /// Drafts that still need to be broadcast, newest first.
  Future<List<TransactionDraft>> submittable() async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      "SELECT * FROM transaction_drafts WHERE status IN ('pending', 'failed') "
      'ORDER BY created_at ASC',
      const <Object?>[],
    );
    return rows.map(_fromRow).toList();
  }

  /// Drafts older than [maxAge] that have not settled yet.
  Future<List<TransactionDraft>> expired({
    required DateTime now,
    Duration maxAge = TransactionDraft.defaultMaxAge,
  }) async {
    await _ensureReady();
    final cutoff = now.subtract(maxAge).millisecondsSinceEpoch;
    final rows = await _executor.runSelect(
      "SELECT * FROM transaction_drafts "
      "WHERE status IN ('pending', 'failed') AND created_at < ? "
      'ORDER BY created_at ASC',
      <Object?>[cutoff],
    );
    return rows.map(_fromRow).toList();
  }

  /// Cancels every draft older than [maxAge] and returns the affected drafts.
  Future<List<TransactionDraft>> cancelExpired({
    required DateTime now,
    Duration maxAge = TransactionDraft.defaultMaxAge,
  }) async {
    final stale = await expired(now: now, maxAge: maxAge);
    for (final draft in stale) {
      await updateStatus(draft.id, DraftStatus.cancelled);
    }
    return stale
        .map((draft) => draft.copyWith(status: DraftStatus.cancelled))
        .toList();
  }

  /// Updates a draft's status and optional attempt bookkeeping.
  Future<void> updateStatus(
    String id,
    DraftStatus status, {
    DateTime? lastAttemptAt,
    String? errorMessage,
  }) async {
    await _ensureReady();
    await _executor.runCustom(
      'UPDATE transaction_drafts SET status = ?, last_attempt_at = ?, '
      'error_message = ? WHERE id = ?',
      <Object?>[
        status.wireName,
        lastAttemptAt?.millisecondsSinceEpoch,
        errorMessage,
        id,
      ],
    );
  }

  /// Deletes the draft with [id].
  Future<void> delete(String id) async {
    await _ensureReady();
    await _executor.runCustom(
      'DELETE FROM transaction_drafts WHERE id = ?',
      <Object?>[id],
    );
  }

  Future<void> close() => _executor.close();

  static TransactionDraft _fromRow(Map<String, Object?> row) {
    int? asMillis(Object? value) => value is int ? value : null;
    final lastAttempt = asMillis(row['last_attempt_at']);
    return TransactionDraft(
      id: row['id']! as String,
      recipient: row['recipient']! as String,
      amount: row['amount']! as String,
      asset: row['asset']! as String,
      createdAt:
          DateTime.fromMillisecondsSinceEpoch(row['created_at']! as int),
      memo: row['memo'] as String?,
      feeEstimate: row['fee_estimate'] as String?,
      status: DraftStatus.fromWire(row['status']! as String),
      lastAttemptAt: lastAttempt == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(lastAttempt),
      errorMessage: row['error_message'] as String?,
    );
  }
}
