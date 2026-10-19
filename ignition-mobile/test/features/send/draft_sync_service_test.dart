import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/send/data/draft_store.dart';
import 'package:ignition_mobile/features/send/data/transaction_draft.dart';
import 'package:ignition_mobile/features/send/services/draft_sync_service.dart';

import 'helpers/send_fakes.dart';

void main() {
  late DraftStore store;
  late FakeConnectivityService connectivity;
  late RecordingDraftNotifier notifier;
  late FakeSecurityEventReporter reporter;

  setUp(() {
    store = inMemoryDraftStore();
    connectivity = FakeConnectivityService();
    notifier = RecordingDraftNotifier();
    reporter = FakeSecurityEventReporter();
  });

  tearDown(() async {
    await store.close();
    await connectivity.dispose();
  });

  DraftSyncService build({
    DraftSubmitter? submit,
    DateTime Function()? clock,
  }) {
    return DraftSyncService(
      store: store,
      connectivity: connectivity,
      submit: submit ?? (_) async {},
      notifier: notifier,
      reporter: reporter,
      clock: clock ?? () => DateTime(2026, 9, 2),
    );
  }

  test('start flushes the queue when online and marks drafts sent', () async {
    await store.save(sampleDraft(id: 'd1'));
    final submitted = <String>[];
    final service = build(submit: (draft) async => submitted.add(draft.id));

    await service.start();

    expect(submitted, ['d1']);
    expect((await store.find('d1'))!.status, DraftStatus.sent);
    expect(notifier.sent, ['d1']);

    await service.dispose();
  });

  test('drafts stay queued while offline and flush on reconnect', () async {
    connectivity.online = false;
    await store.save(sampleDraft(id: 'd1'));
    final service = build();

    await service.start();
    expect((await store.find('d1'))!.status, DraftStatus.pending);

    connectivity.goOnline();
    await pumpEventQueue(times: 100);

    expect((await store.find('d1'))!.status, DraftStatus.sent);
    expect(notifier.sent, ['d1']);

    await service.dispose();
  });

  test('a failed submission records the error and stays retryable', () async {
    await store.save(sampleDraft(id: 'd1'));
    final service = build(
      submit: (_) async => throw Exception('network down'),
    );

    await service.start();

    final draft = await store.find('d1');
    expect(draft!.status, DraftStatus.failed);
    expect(draft.errorMessage, contains('network down'));
    expect(notifier.failed, ['d1']);
    expect(reporter.failures, contains('offline_draft_submission_failed'));

    await service.dispose();
  });

  test('cancelExpiredDrafts cancels stale drafts and notifies', () async {
    await store.save(sampleDraft(id: 'old', createdAt: DateTime(2026, 9, 1)));
    final service = build(clock: () => DateTime(2026, 9, 20));

    final cancelled = await service.cancelExpiredDrafts();

    expect(cancelled, 1);
    expect((await store.find('old'))!.status, DraftStatus.cancelled);
    expect(notifier.cancelled, ['old']);

    await service.dispose();
  });

  test('start auto-cancels expired drafts before submitting', () async {
    await store.save(sampleDraft(id: 'old', createdAt: DateTime(2026, 9, 1)));
    final service = build(clock: () => DateTime(2026, 9, 20));

    await service.start();

    expect((await store.find('old'))!.status, DraftStatus.cancelled);
    expect(notifier.cancelled, ['old']);
    expect(notifier.sent, isEmpty);

    await service.dispose();
  });

  test('cancel marks a queued draft cancelled', () async {
    await store.save(sampleDraft(id: 'd1'));
    final service = build();

    await service.cancel('d1');

    expect((await store.find('d1'))!.status, DraftStatus.cancelled);
    expect(notifier.cancelled, ['d1']);

    await service.dispose();
  });

  test('emits draft changes so the UI can refresh', () async {
    await store.save(sampleDraft(id: 'd1'));
    final service = build();
    final seen = <DraftStatus>[];
    final subscription = service.changes.listen((draft) => seen.add(draft.status));

    await service.submitPending();
    await pumpEventQueue();

    expect(seen, contains(DraftStatus.sent));

    await subscription.cancel();
    await service.dispose();
  });
}
