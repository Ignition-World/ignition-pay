import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ignition_mobile/core/design_system/app_error_banner.dart';
import 'package:ignition_mobile/core/local/balance_cache.dart';
import 'package:ignition_mobile/features/home/pages/home_page.dart';
import 'package:ignition_mobile/features/home/services/home_service.dart';

/// Minimal wrapper for [HomePage].
///
/// Deliberately not the shared `testApp` helper: the app theme and the
/// `test_utils` barrel don't currently compile, and this suite should only
/// depend on the widgets under test.
Widget wrapHome(HomePage page, {ThemeData? theme}) {
  return MaterialApp(
    theme: theme ?? ThemeData(),
    debugShowCheckedModeBanner: false,
    home: Scaffold(body: page),
  );
}

/// In-memory [HomeDataSource] fake with controllable failure and timing.
class FakeHomeDataSource implements HomeDataSource {
  int balanceFetches = 0;
  int transactionFetches = 0;
  int notificationFetches = 0;

  /// While true every request fails, simulating a network outage.
  bool failing = false;

  /// When set, every request waits for this completer before settling.
  Completer<void>? gate;

  Map<String, dynamic> balances = {'USD': '10.00'};
  List<Map<String, dynamic>> transactions = [
    {
      'id': 't1',
      'amount': '5.00',
      'assetCode': 'XLM',
      'status': 'completed',
      'createdAt': '2026-09-01T10:00:00Z',
    },
  ];
  List<Map<String, dynamic>> notifications = [
    {
      'id': 'n1',
      'type': 'payment',
      'title': 'Payment received',
      'createdAt': '2026-09-01T10:00:00Z',
    },
  ];

  @override
  Future<Map<String, dynamic>> fetchBalances() async {
    balanceFetches++;
    await _settle();
    return balances;
  }

  @override
  Future<List<Map<String, dynamic>>> fetchTransactions() async {
    transactionFetches++;
    await _settle();
    return transactions;
  }

  @override
  Future<List<Map<String, dynamic>>> fetchNotifications() async {
    notificationFetches++;
    await _settle();
    return notifications;
  }

  Future<void> _settle() async {
    final pending = gate;
    if (pending != null) await pending.future;
    if (failing) throw Exception('network down');
  }
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
  late FakeHomeDataSource dataSource;
  late FakeBalanceCache cache;

  setUp(() {
    dataSource = FakeHomeDataSource();
    cache = FakeBalanceCache();
  });

  Widget buildHome({ThemeData? theme}) {
    return wrapHome(
      HomePage(dataSource: dataSource, balanceCache: cache),
      theme: theme,
    );
  }

  /// Drags the list down and advances time through the refresh cycle
  /// (scroll animation, indicator snap, onRefresh, dismissal). Never settles,
  /// so an in-flight refresh can be inspected between pumps.
  Future<void> pullDown(WidgetTester tester) async {
    await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets(
      'pull-to-refresh reloads balances, transactions and notifications',
      (tester) async {
    await tester.pumpWidget(buildHome());
    await tester.pump();

    // Launch reads only the cache — no network requests yet.
    expect(dataSource.balanceFetches, 0);
    expect(find.text('No cached balances yet'), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);

    await pullDown(tester);
    await tester.pumpAndSettle();

    expect(dataSource.balanceFetches, 1);
    expect(dataSource.transactionFetches, 1);
    expect(dataSource.notificationFetches, 1);

    // Freshly fetched slices are rendered.
    expect(find.text('10.00'), findsOneWidget);
    expect(find.text('Recent transactions'), findsOneWidget);
    expect(find.text('5.00 XLM'), findsOneWidget);
    expect(find.text('Unread notifications'), findsOneWidget);
    expect(find.text('Payment received'), findsOneWidget);
    expect(find.byType(AppErrorBanner), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('keeps existing data visible while a refresh is in flight',
      (tester) async {
    await cache.write('current-wallet', {'USD': '10.00'});
    dataSource.balances = {'USD': '99.00'};
    final gate = Completer<void>();
    dataSource.gate = gate;

    await tester.pumpWidget(buildHome());
    await tester.pump();
    expect(find.text('10.00'), findsOneWidget);

    await pullDown(tester);

    // The refresh is still in flight: old data stays, spinner animates.
    expect(find.text('10.00'), findsOneWidget);
    expect(find.text('99.00'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);

    gate.complete();
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('99.00'), findsOneWidget);
    expect(find.text('10.00'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('failed refresh keeps data and offers retry, retry recovers',
      (tester) async {
    await cache.write('current-wallet', {'USD': '10.00'});
    dataSource.balances = {'USD': '99.00'};
    dataSource.failing = true;

    await tester.pumpWidget(buildHome());
    await tester.pump();

    await pullDown(tester);
    await tester.pumpAndSettle();

    // Failure keeps the data the user already had and surfaces a retry.
    expect(find.text('10.00'), findsOneWidget);
    expect(find.byType(AppErrorBanner), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    dataSource.failing = false;
    await tester.tap(find.text('Retry'));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.byType(AppErrorBanner), findsNothing);
    expect(find.text('Retry'), findsNothing);
    expect(find.text('99.00'), findsOneWidget);
  });

  testWidgets('uses a Cupertino refresh control on iOS', (tester) async {
    await tester.pumpWidget(
      buildHome(theme: ThemeData(platform: TargetPlatform.iOS)),
    );
    await tester.pump();

    // The refresh control reports geometry.visible == false while idle, so it
    // is offstage for default finders — see Viewport.debugVisitOnstageChildren.
    expect(
      find.byType(CupertinoSliverRefreshControl, skipOffstage: false),
      findsOneWidget,
    );
    expect(find.byType(CustomScrollView), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsNothing);
  });
}
