import 'dart:async';

import 'package:drift/native.dart';
import 'package:ignition_mobile/core/monitoring/security_event_reporter.dart';
import 'package:ignition_mobile/core/network/connectivity_service.dart';
import 'package:ignition_mobile/features/send/data/draft_store.dart';
import 'package:ignition_mobile/features/send/data/transaction_draft.dart';
import 'package:ignition_mobile/features/send/services/draft_notifier.dart';

/// A well-formed Stellar account id.
final String sampleAddress = 'G${'A' * 55}';

/// In-memory [DraftStore] so tests never touch the filesystem.
DraftStore inMemoryDraftStore() => DraftStore(executor: NativeDatabase.memory());

/// Builds a draft with sensible defaults for tests.
TransactionDraft sampleDraft({
  String id = 'draft-1',
  String? recipient,
  String amount = '10',
  String asset = 'USDC',
  String? memo,
  DraftStatus status = DraftStatus.pending,
  DateTime? createdAt,
}) {
  return TransactionDraft(
    id: id,
    recipient: recipient ?? sampleAddress,
    amount: amount,
    asset: asset,
    memo: memo,
    feeEstimate: '0.00001 XLM',
    createdAt: createdAt ?? DateTime(2026, 9, 1),
    status: status,
  );
}

/// In-memory [DraftStore] double so widget tests stay deterministic and
/// never touch sqlite.
class FakeDraftStore extends DraftStore {
  FakeDraftStore([List<TransactionDraft>? seed])
      : drafts = List<TransactionDraft>.of(seed ?? const <TransactionDraft>[]),
        super(executor: NativeDatabase.memory());

  final List<TransactionDraft> drafts;

  @override
  Future<List<TransactionDraft>> submittable() async =>
      drafts.where((draft) => draft.isSubmittable).toList();

  @override
  Future<List<TransactionDraft>> all() async => List<TransactionDraft>.of(drafts);

  @override
  Future<TransactionDraft?> find(String id) async {
    for (final draft in drafts) {
      if (draft.id == id) return draft;
    }
    return null;
  }

  @override
  Future<void> updateStatus(
    String id,
    DraftStatus status, {
    DateTime? lastAttemptAt,
    String? errorMessage,
  }) async {
    final index = drafts.indexWhere((draft) => draft.id == id);
    if (index == -1) return;
    drafts[index] = drafts[index].copyWith(
      status: status,
      lastAttemptAt: lastAttemptAt,
      errorMessage: errorMessage,
    );
  }
}

/// Controllable [ConnectivityService] for offline/online transitions.
class FakeConnectivityService implements ConnectivityService {
  FakeConnectivityService({this.online = true});

  bool online;

  final StreamController<bool> _controller =
      StreamController<bool>.broadcast();

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get onConnectivityChanged => _controller.stream;

  void goOnline() {
    online = true;
    _controller.add(true);
  }

  void goOffline() {
    online = false;
    _controller.add(false);
  }

  Future<void> dispose() => _controller.close();
}

/// Records every notification the sync service emits.
class RecordingDraftNotifier implements DraftNotifier {
  final List<String> sent = <String>[];
  final List<String> cancelled = <String>[];
  final List<String> failed = <String>[];

  @override
  Future<void> draftSent(TransactionDraft draft) async => sent.add(draft.id);

  @override
  Future<void> draftCancelled(TransactionDraft draft) async =>
      cancelled.add(draft.id);

  @override
  Future<void> draftFailed(TransactionDraft draft) async => failed.add(draft.id);
}

/// Captures reported security events.
class FakeSecurityEventReporter implements SecurityEventReporter {
  final List<String> failures = <String>[];
  final List<String> events = <String>[];

  @override
  Future<void> reportFailure(
    Object error,
    StackTrace stackTrace, {
    String? reason,
  }) async {
    failures.add(reason ?? 'unknown');
  }

  @override
  Future<void> reportEvent(String message, {String? reason}) async {
    events.add(reason ?? message);
  }
}
