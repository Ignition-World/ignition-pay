import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/core/design_system/app_error_banner.dart';
import 'package:ignition_mobile/core/local/balance_cache.dart';
import 'package:ignition_mobile/features/home/pages/home_page.dart';
import 'package:ignition_mobile/features/home/widgets/home_skeleton.dart';

/// Minimal wrapper for [HomePage].
///
/// Deliberately self-contained (like [home_page_test]) so the suite only
/// depends on the widgets under test.
Widget wrapHome(HomePage page, {ThemeData? theme}) {
  return MaterialApp(
    theme: theme ?? ThemeData(),
    debugShowCheckedModeBanner: false,
    home: Scaffold(body: page),
  );
}

/// In-memory [BalanceCache] fake backed by a [Mock] so private members of the
/// real cache don't have to be implemented.
class FakeBalanceCache extends Mock implements BalanceCache {
  final Map<String, CachedBalances> entries = {};

  @override
  Future<CachedBalances?> read(String walletAddress) async =>
      entries[walletAddress];

  @override
  Future<void> write(
    String walletAddress,
    Map<String, dynamic> balances,
  ) async {
    entries[walletAddress] = CachedBalances(
      walletAddress: walletAddress,
      balances: balances,
      updatedAt: DateTime.now(),
    );
  }

  @override
  Future<void> invalidate(String walletAddress) async {
    entries.remove(walletAddress);
  }

  @override
  Future<void> close() async {}
}

void main() {
  late FakeBalanceCache cache;

  setUp(() {
    cache = FakeBalanceCache();
  });

  testWidgets('shows the skeleton while the first load is in flight',
      (tester) async {
    // First load hangs on the legacy fetch seam so the skeleton is observable.
    final gate = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(
      wrapHome(
        HomePage(balanceCache: cache, fetchBalances: () => gate.future),
      ),
    );
    await tester.pump();

    expect(find.byKey(HomeSkeleton.skeletonKey), findsOneWidget);
    expect(find.text('No cached balances yet'), findsNothing);
    expect(find.byType(AppErrorBanner), findsNothing);

    // Skeleton persists while the load is still unresolved.
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(HomeSkeleton.skeletonKey), findsOneWidget);

    gate.complete({'USD': '5.00'});
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(find.byKey(HomeSkeleton.skeletonKey), findsNothing);
    expect(find.text('5.00'), findsOneWidget);
  });

  testWidgets('keeps the skeleton visible for at least 300ms (no flash)',
      (tester) async {
    // Cache read resolves immediately — without the minimum window the
    // skeleton would flash for a single frame.
    await cache.write('current-wallet', {'USD': '10.00'});
    await tester.pumpWidget(wrapHome(HomePage(balanceCache: cache)));
    await tester.pump();

    expect(find.byKey(HomeSkeleton.skeletonKey), findsOneWidget);

    // Just before the 300ms floor the skeleton must still be there.
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.byKey(HomeSkeleton.skeletonKey), findsOneWidget);
    expect(find.text('10.00'), findsNothing);

    // Past the floor it swaps to the loaded content.
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.byKey(HomeSkeleton.skeletonKey), findsNothing);
    expect(find.text('10.00'), findsOneWidget);
  });

  testWidgets('error state replaces the skeleton when the load fails',
      (tester) async {
    final gate = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(
      wrapHome(
        HomePage(balanceCache: cache, fetchBalances: () => gate.future),
      ),
    );
    await tester.pump();
    expect(find.byKey(HomeSkeleton.skeletonKey), findsOneWidget);

    gate.completeError(Exception('network down'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    // Error banner replaces the skeleton; no Retry-less blank state.
    expect(find.byKey(HomeSkeleton.skeletonKey), findsNothing);
    expect(find.byType(AppErrorBanner), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('skeleton rows render at the loaded ListTile height (no shift)',
      (tester) async {
    final gate = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(
      wrapHome(
        HomePage(balanceCache: cache, fetchBalances: () => gate.future),
      ),
    );
    await tester.pump();

    // Every skeleton row is a fixed-height box sized to ListTile
    // (3 balance + 3 transaction + 2 notification rows).
    final rows = tester.widgetList(
      find.descendant(
        of: find.byKey(HomeSkeleton.skeletonKey),
        matching: find.byWidgetPredicate(
          (w) => w is SizedBox && w.height == 56,
        ),
      ),
    );
    expect(rows, hasLength(8));
    const rowHeight = 56.0;

    // The loaded rows render at the same height, so swapping skeleton for
    // content doesn't shift the page.
    gate.complete({
      'USD': '10.00',
      'EUR': '20.00',
    });
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    final tiles = find.byType(ListTile);
    expect(tiles, findsWidgets);
    expect(tester.getSize(tiles.first).height, rowHeight);
  });
}
