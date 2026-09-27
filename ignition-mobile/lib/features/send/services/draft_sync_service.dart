import 'dart:async';

import '../../../core/monitoring/security_event_reporter.dart';
import '../../../core/network/connectivity_service.dart';
import '../data/draft_store.dart';
import '../data/transaction_draft.dart';
import 'draft_notifier.dart';

/// Broadcasts a single draft. Throwing signals a failure so the draft stays
/// queued for a later retry.
typedef DraftSubmitter = Future<void> Function(TransactionDraft draft);

/// Watches connectivity and flushes queued send drafts once the device is
/// back online (issue #678).
class DraftSyncService {
  DraftSyncService({
    required DraftStore store,
    required ConnectivityService connectivity,
    required DraftSubmitter submit,
    DraftNotifier? notifier,
    SecurityEventReporter reporter = const SentrySecurityEventReporter(),
    DateTime Function() clock = DateTime.now,
    Duration maxDraftAge = TransactionDraft.defaultMaxAge,
  })  : _store = store,
        _connectivity = connectivity,
        _submitter = submit,
        _notifier = notifier,
        _reporter = reporter,
        _clock = clock,
        _maxDraftAge = maxDraftAge;

  final DraftStore _store;
  final ConnectivityService _connectivity;
  final DraftSubmitter _submitter;
  final DraftNotifier? _notifier;
  final SecurityEventReporter _reporter;
  final DateTime Function() _clock;
  final Duration _maxDraftAge;

  final StreamController<TransactionDraft> _changes =
      StreamController<TransactionDraft>.broadcast();

  StreamSubscription<bool>? _connectivitySubscription;
  bool _submitting = false;
  bool _disposed = false;

  /// Emits every draft the service creates, submits, cancels or fails, so UI
  /// can refresh without polling the database.
  Stream<TransactionDraft> get changes => _changes.stream;

  /// The maximum age passed to [DraftStore.cancelExpired].
  Duration get maxDraftAge => _maxDraftAge;

  /// Cancels expired drafts, then subscribes to connectivity and flushes any
  /// backlog immediately when the device is already online.
  Future<void> start() async {
    await cancelExpiredDrafts();
    _connectivitySubscription ??=
        _connectivity.onConnectivityChanged.listen((online) {
      if (online) unawaited(submitPending());
    });
    if (await _connectivity.isOnline()) {
      await submitPending();
    }
  }

  /// Stops listening for connectivity changes. [start] may be called again.
  Future<void> stop() async {
    await _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
  }

  /// Releases the service; the instance must not be used afterwards.
  Future<void> dispose() async {
    _disposed = true;
    await stop();
    await _changes.close();
  }

  /// Auto-cancels drafts older than [maxDraftAge], notifying for each.
  Future<int> cancelExpiredDrafts() async {
    final cancelled = await _store.cancelExpired(
      now: _clock(),
      maxAge: _maxDraftAge,
    );
    for (final draft in cancelled) {
      _addChange(draft);
      await _notifier?.draftCancelled(draft);
    }
    return cancelled.length;
  }

  /// Submits every queued draft. Safe to call concurrently — overlapping
  /// invocations are coalesced.
  Future<void> submitPending() async {
    if (_submitting || _disposed) return;
    _submitting = true;
    try {
      if (!await _connectivity.isOnline()) return;
      final drafts = await _store.submittable();
      for (final draft in drafts) {
        if (_disposed) break;
        await _submit(draft);
      }
    } finally {
      _submitting = false;
    }
  }

  /// Submits a single draft by [id] if it is still queued.
  Future<void> submitDraft(String id) async {
    final draft = await _store.find(id);
    if (draft == null || !draft.isSubmittable) return;
    if (!await _connectivity.isOnline()) return;
    await _submit(draft);
  }

  /// Cancels a queued draft by [id].
  Future<void> cancel(String id) async {
    final draft = await _store.find(id);
    if (draft == null || draft.isSettled) return;
    await _store.updateStatus(id, DraftStatus.cancelled, lastAttemptAt: _clock());
    final cancelled = draft.copyWith(status: DraftStatus.cancelled);
    _addChange(cancelled);
    await _notifier?.draftCancelled(cancelled);
  }

  Future<void> _submit(TransactionDraft draft) async {
    final attemptAt = _clock();
    await _store.updateStatus(
      draft.id,
      DraftStatus.submitting,
      lastAttemptAt: attemptAt,
    );
    _addChange(draft.copyWith(
      status: DraftStatus.submitting,
      lastAttemptAt: attemptAt,
    ));

    try {
      await _submitter(draft);
      await _store.updateStatus(
        draft.id,
        DraftStatus.sent,
        lastAttemptAt: _clock(),
      );
      final sent = draft.copyWith(
        status: DraftStatus.sent,
        lastAttemptAt: _clock(),
        clearError: true,
      );
      _addChange(sent);
      await _notifier?.draftSent(sent);
    } catch (error, stackTrace) {
      final message = error.toString();
      await _store.updateStatus(
        draft.id,
        DraftStatus.failed,
        lastAttemptAt: _clock(),
        errorMessage: message,
      );
      final failed = draft.copyWith(
        status: DraftStatus.failed,
        lastAttemptAt: _clock(),
        errorMessage: message,
      );
      _addChange(failed);
      await _reporter.reportFailure(
        error,
        stackTrace,
        reason: 'offline_draft_submission_failed',
      );
      await _notifier?.draftFailed(failed);
    }
  }

  void _addChange(TransactionDraft draft) {
    if (!_changes.isClosed) _changes.add(draft);
  }
}
