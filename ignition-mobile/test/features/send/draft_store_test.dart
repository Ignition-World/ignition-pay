import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/features/send/data/draft_store.dart';
import 'package:ignition_mobile/features/send/data/transaction_draft.dart';

import 'helpers/send_fakes.dart';

void main() {
  late DraftStore store;

  setUp(() {
    store = inMemoryDraftStore();
  });

  tearDown(() async {
    await store.close();
  });

  test('save then find round-trips every field', () async {
    final draft = sampleDraft(
      id: 'draft-42',
      amount: '12.5',
      asset: 'USDC',
      memo: 'lunch',
    );

    await store.save(draft);
    final restored = await store.find('draft-42');

    expect(restored, isNotNull);
    expect(restored!.id, draft.id);
    expect(restored.recipient, draft.recipient);
    expect(restored.amount, '12.5');
    expect(restored.asset, 'USDC');
    expect(restored.memo, 'lunch');
    expect(restored.feeEstimate, draft.feeEstimate);
    expect(restored.createdAt, draft.createdAt);
    expect(restored.status, DraftStatus.pending);
  });

  test('find returns null for an unknown id', () async {
    expect(await store.find('missing'), isNull);
  });

  test('save replaces an existing draft with the same id', () async {
    await store.save(sampleDraft(id: 'd1', amount: '1'));
    await store.save(sampleDraft(id: 'd1', amount: '2'));

    final all = await store.all();
    expect(all, hasLength(1));
    expect(all.single.amount, '2');
  });

  test('submittable only returns pending and failed drafts', () async {
    await store.save(sampleDraft(id: 'pending'));
    await store.save(sampleDraft(id: 'failed', status: DraftStatus.failed));
    await store.save(sampleDraft(id: 'sent', status: DraftStatus.sent));
    await store.save(sampleDraft(id: 'cancelled', status: DraftStatus.cancelled));

    final ids = (await store.submittable()).map((d) => d.id).toSet();
    expect(ids, {'pending', 'failed'});
  });

  test('updateStatus persists status, attempt time and error', () async {
    await store.save(sampleDraft(id: 'd1'));

    final attempt = DateTime(2026, 9, 2, 8);
    await store.updateStatus(
      'd1',
      DraftStatus.failed,
      lastAttemptAt: attempt,
      errorMessage: 'boom',
    );

    final restored = await store.find('d1');
    expect(restored!.status, DraftStatus.failed);
    expect(restored.lastAttemptAt, attempt);
    expect(restored.errorMessage, 'boom');
  });

  test('expired returns only unsettled drafts older than the max age', () async {
    final now = DateTime(2026, 9, 20);
    await store.save(
      sampleDraft(id: 'old', createdAt: now.subtract(const Duration(days: 8))),
    );
    await store.save(
      sampleDraft(id: 'fresh', createdAt: now.subtract(const Duration(days: 1))),
    );
    await store.save(
      sampleDraft(
        id: 'old-sent',
        status: DraftStatus.sent,
        createdAt: now.subtract(const Duration(days: 30)),
      ),
    );

    final expired = await store.expired(now: now);
    expect(expired.map((d) => d.id), ['old']);
  });

  test('cancelExpired cancels stale drafts and returns them', () async {
    final now = DateTime(2026, 9, 20);
    await store.save(
      sampleDraft(id: 'old', createdAt: now.subtract(const Duration(days: 8))),
    );
    await store.save(sampleDraft(id: 'fresh', createdAt: now));

    final cancelled = await store.cancelExpired(now: now);

    expect(cancelled.map((d) => d.id), ['old']);
    expect(cancelled.single.status, DraftStatus.cancelled);
    expect((await store.find('old'))!.status, DraftStatus.cancelled);
    expect((await store.find('fresh'))!.status, DraftStatus.pending);
  });

  test('delete removes the draft', () async {
    await store.save(sampleDraft(id: 'd1'));
    await store.delete('d1');
    expect(await store.find('d1'), isNull);
  });

  test('all returns drafts newest first', () async {
    await store.save(sampleDraft(id: 'older', createdAt: DateTime(2026, 1, 1)));
    await store.save(sampleDraft(id: 'newer', createdAt: DateTime(2026, 9, 1)));

    expect((await store.all()).map((d) => d.id), ['newer', 'older']);
  });
}
