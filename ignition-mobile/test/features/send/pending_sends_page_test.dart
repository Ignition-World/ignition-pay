import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/features/send/data/transaction_draft.dart';
import 'package:ignition_mobile/features/send/pages/pending_sends_page.dart';
import 'package:ignition_mobile/features/send/services/draft_sync_service.dart';

import 'helpers/send_fakes.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(home: child);

  testWidgets('shows an empty state when nothing is queued', (tester) async {
    final store = FakeDraftStore();

    await tester.pumpWidget(wrap(PendingSendsPage(store: store)));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('pending_sends_empty')), findsOneWidget);
  });

  testWidgets('lists queued drafts', (tester) async {
    final store = FakeDraftStore(<TransactionDraft>[
      sampleDraft(id: 'd1', amount: '5', asset: 'XLM'),
    ]);

    await tester.pumpWidget(wrap(PendingSendsPage(store: store)));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('pending_send_d1')), findsOneWidget);
    expect(find.textContaining('5 XLM'), findsOneWidget);
  });

  testWidgets('cancelling a draft removes it from the list', (tester) async {
    final store = FakeDraftStore(<TransactionDraft>[
      sampleDraft(id: 'd1'),
    ]);

    await tester.pumpWidget(wrap(PendingSendsPage(store: store)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('cancel_draft_d1')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('pending_sends_empty')), findsOneWidget);
    expect(store.drafts.single.status, DraftStatus.cancelled);
  });

  testWidgets('cancelling through the sync service notifies the user',
      (tester) async {
    final store = FakeDraftStore(<TransactionDraft>[sampleDraft(id: 'd1')]);
    final connectivity = FakeConnectivityService();
    final notifier = RecordingDraftNotifier();
    final service = DraftSyncService(
      store: store,
      connectivity: connectivity,
      submit: (_) async {},
      notifier: notifier,
    );

    await tester.pumpWidget(
      wrap(PendingSendsPage(store: store, syncService: service)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('cancel_draft_d1')));
    await tester.pumpAndSettle();

    expect(store.drafts.single.status, DraftStatus.cancelled);
    expect(notifier.cancelled, ['d1']);

    await service.dispose();
    await connectivity.dispose();
  });
}
