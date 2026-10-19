import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:ignition_mobile/features/home/pages/history_data_source.dart';
import 'package:ignition_mobile/features/home/pages/history_section.dart';
import 'package:ignition_mobile/features/home/widgets/swipeable_transaction_tile.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';

// ── Test helpers ─────────────────────────────────────────────────────────────

/// Wraps [HistorySection] in a routed [MaterialApp] with a
/// [ScaffoldMessenger] so snackbars work correctly.
Widget _buildHistorySection() {
  final router = GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Scaffold(body: HistorySection()),
      ),
      GoRoute(
        path: '/transaction/:id',
        builder: (_, state) =>
            Scaffold(body: Text('tx:${state.pathParameters['id']}')),
      ),
    ],
  );

  return MaterialApp.router(
    theme: AppTheme.light(),
    debugShowCheckedModeBanner: false,
    routerConfig: router,
  );
}

/// Builds a standalone [SwipeableTransactionTile] with controllable
/// callbacks.
Widget _buildTile({
  required HistoryTransaction transaction,
  TransactionActionCallback? onDelete,
  TransactionActionCallback? onArchive,
  VoidCallback? onTap,
  Duration undoDuration = const Duration(seconds: 5),
}) {
  return MaterialApp(
    theme: AppTheme.light(),
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      body: ListView(
        children: [
          SwipeableTransactionTile(
            transaction: transaction,
            onDelete: onDelete ?? (_) async {},
            onArchive: onArchive ?? (_) async {},
            onTap: onTap,
            undoDuration: undoDuration,
          ),
        ],
      ),
    ),
  );
}

/// A reusable sample transaction.
HistoryTransaction _tx({String id = 'tx_001'}) => HistoryTransaction(
      id: id,
      assetCode: 'XLM',
      amount: '42.00',
      status: 'Confirmed',
      createdAt: DateTime(2026, 9, 26, 6, 0),
    );

// ── Tests ─────────────────────────────────────────────────────────────────────

void main() {
  // ── Rendering ─────────────────────────────────────────────────────────────

  group('SwipeableTransactionTile — rendering', () {
    testWidgets('renders transaction amount and asset code', (tester) async {
      await tester.pumpWidget(_buildTile(transaction: _tx()));
      expect(find.textContaining('42'), findsOneWidget);
      expect(find.textContaining('XLM'), findsOneWidget);
    });

    testWidgets('onTap fires when the tile body is tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        _buildTile(transaction: _tx(), onTap: () => tapped = true),
      );
      await tester.tap(find.byType(SwipeableTransactionTile));
      expect(tapped, isTrue);
    });
  });

  // ── Android swipe-left → Delete ───────────────────────────────────────────
  //
  // Tests run on Linux by default, which takes the Android/Material path
  // inside SwipeableTransactionTile.

  group('SwipeableTransactionTile — Android delete (swipe left)', () {
    testWidgets('partial swipe reveals delete icon', (tester) async {
      await tester.pumpWidget(_buildTile(transaction: _tx()));

      await tester.drag(
        find.byType(SwipeableTransactionTile),
        const Offset(-120, 0),
      );
      await tester.pump();

      expect(
        find.descendant(
          of: find.byType(Dismissible),
          matching: find.byIcon(Icons.delete_outline),
        ),
        findsOneWidget,
      );
    });

    testWidgets('full swipe shows undo snackbar', (tester) async {
      await tester.pumpWidget(_buildTile(
        transaction: _tx(),
        undoDuration: const Duration(milliseconds: 300),
      ));

      await tester.fling(
        find.byType(SwipeableTransactionTile),
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.text('Undo'), findsOneWidget);
      expect(find.textContaining('deleted'), findsOneWidget);
    });

    testWidgets('delete callback fires after undo window expires',
        (tester) async {
      var deleteCallCount = 0;
      await tester.pumpWidget(_buildTile(
        transaction: _tx(),
        onDelete: (_) async => deleteCallCount++,
        undoDuration: const Duration(milliseconds: 100),
      ));

      await tester.fling(
        find.byType(SwipeableTransactionTile),
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      // Undo window still open — callback not yet invoked.
      expect(deleteCallCount, 0);

      // Let the undo window expire.
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();

      expect(deleteCallCount, 1);
    });

    testWidgets('tapping Undo cancels the API call', (tester) async {
      var deleteCalled = false;
      await tester.pumpWidget(_buildTile(
        transaction: _tx(),
        onDelete: (_) async => deleteCalled = true,
        undoDuration: const Duration(seconds: 5),
      ));

      await tester.fling(
        find.byType(SwipeableTransactionTile),
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      expect(find.text('Undo'), findsOneWidget);

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();

      // API must NOT have been called.
      expect(deleteCalled, isFalse);
    });

    testWidgets('snackbar dismisses after Undo is tapped', (tester) async {
      await tester.pumpWidget(_buildTile(
        transaction: _tx(),
        undoDuration: const Duration(seconds: 5),
      ));

      await tester.fling(
        find.byType(SwipeableTransactionTile),
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();

      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('tile remains in the tree after Undo is tapped', (tester) async {
      await tester.pumpWidget(_buildTile(
        transaction: _tx(),
        undoDuration: const Duration(seconds: 5),
      ));

      await tester.fling(
        find.byType(SwipeableTransactionTile),
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();

      // Dismissible returned false → item is back in the tree.
      expect(find.byType(SwipeableTransactionTile), findsOneWidget);
    });
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  group('SwipeableTransactionTile — accessibility semantics', () {
    testWidgets('delete background carries a semantic label', (tester) async {
      await tester.pumpWidget(_buildTile(transaction: _tx()));

      // Partially swipe so the background slot is rendered.
      await tester.drag(
        find.byType(SwipeableTransactionTile),
        const Offset(-120, 0),
      );
      await tester.pump();

      expect(find.bySemanticsLabel('Delete transaction'), findsOneWidget);
    });
  });

  // ── HistorySection integration ─────────────────────────────────────────────

  group('HistorySection — swipe integration', () {
    testWidgets('each visible row is wrapped in a SwipeableTransactionTile',
        (tester) async {
      await tester.pumpWidget(_buildHistorySection());
      await tester.pumpAndSettle();

      expect(find.byType(SwipeableTransactionTile), findsWidgets);
    });

    testWidgets('swiping a tile removes it from the visible list',
        (tester) async {
      await tester.pumpWidget(_buildHistorySection());
      await tester.pumpAndSettle();

      final countBefore =
          tester.widgetList(find.byType(SwipeableTransactionTile)).length;

      await tester.fling(
        find.byType(SwipeableTransactionTile).first,
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      expect(find.byType(SnackBar), findsOneWidget);

      final countAfterSwipe =
          tester.widgetList(find.byType(SwipeableTransactionTile)).length;
      expect(countAfterSwipe, lessThan(countBefore));
    });

    testWidgets('Undo restores the dismissed tile', (tester) async {
      await tester.pumpWidget(_buildHistorySection());
      await tester.pumpAndSettle();

      final countBefore =
          tester.widgetList(find.byType(SwipeableTransactionTile)).length;

      await tester.fling(
        find.byType(SwipeableTransactionTile).first,
        const Offset(-600, 0),
        2000,
      );
      await tester.pumpAndSettle();

      final countAfterSwipe =
          tester.widgetList(find.byType(SwipeableTransactionTile)).length;
      expect(countAfterSwipe, lessThan(countBefore));

      await tester.tap(find.text('Undo'));
      await tester.pumpAndSettle();

      final countAfterUndo =
          tester.widgetList(find.byType(SwipeableTransactionTile)).length;
      expect(countAfterUndo, equals(countBefore));
    });
  });
}
