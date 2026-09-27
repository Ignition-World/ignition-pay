import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/features/send/data/draft_store.dart';
import 'package:ignition_mobile/features/send/data/transaction_draft.dart';
import 'package:ignition_mobile/features/send/payment_review_page.dart';

/// [DraftStore] double that records saves without touching sqlite.
class RecordingDraftStore extends DraftStore {
  RecordingDraftStore() : super(executor: NativeDatabase.memory());

  final List<TransactionDraft> saved = <TransactionDraft>[];

  @override
  Future<void> save(TransactionDraft draft) async => saved.add(draft);
}

void main() {
  final account = 'G${'A' * 55}';

  Future<void> openForm(WidgetTester tester, PaymentReviewPage page) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => page),
                ),
                child: const Text('open form'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open form'));
    await tester.pumpAndSettle();
  }

  testWidgets('abandoning an incomplete form persists a draft', (tester) async {
    final store = RecordingDraftStore();
    await openForm(
      tester,
      PaymentReviewPage(
        initialAddress: 'Gshort',
        initialAmount: '3',
        initialAsset: 'USDC',
        initialMemo: 'note',
        draftStore: store,
        draftIdGenerator: () => 'draft-1',
      ),
    );

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(store.saved, hasLength(1));
    final draft = store.saved.single;
    expect(draft.id, 'draft-1');
    expect(draft.recipient, 'Gshort');
    expect(draft.amount, '3');
    expect(draft.asset, 'USDC');
    expect(draft.memo, 'note');
    expect(draft.feeEstimate, isNotNull);
  });

  testWidgets('a valid, complete form is not persisted', (tester) async {
    final store = RecordingDraftStore();
    await openForm(
      tester,
      PaymentReviewPage(
        initialAddress: account,
        initialAmount: '3',
        initialAsset: 'XLM',
        draftStore: store,
      ),
    );

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(store.saved, isEmpty);
  });

  testWidgets('an untouched form is not persisted', (tester) async {
    final store = RecordingDraftStore();
    await openForm(
      tester,
      PaymentReviewPage(
        initialAddress: '',
        initialAmount: null,
        initialAsset: 'XLM',
        draftStore: store,
      ),
    );

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(store.saved, isEmpty);
  });
}
