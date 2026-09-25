import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../core/design_system/app_error_banner.dart';
import '../../../core/local/balance_cache.dart';
import '../services/home_service.dart';
import '../widgets/home_skeleton.dart';

/// Home dashboard with pull-to-refresh.
///
/// While the first load runs, the page body shows a [HomeSkeleton] instead
/// of a blank screen. The skeleton stays up for at least 300ms so a fast
/// response doesn't cause a flash, and is replaced by real data (or an error
/// banner with Retry) as soon as both conditions hold.
///
/// Pulling down reloads balances, recent transactions and unread
/// notifications through [HomeDataSource]. Existing data stays on screen for
/// the whole flight of the request; only a successful response replaces it.
/// A failed refresh keeps the current data and surfaces an inline error with
/// a Retry action instead of blanking what the user is already looking at.
///
/// The refresh affordance follows the current platform: a Material
/// [RefreshIndicator] on Android and a Cupertino-style
/// [CupertinoSliverRefreshControl] on iOS/macOS.
class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    this.walletAddress = 'current-wallet',
    this.fetchBalances,
    this.dataSource,
    this.balanceCache,
  });

  final String walletAddress;

  /// Optional legacy seam: returns fresh balances directly. When provided it
  /// is preferred over [dataSource] for balance loads on launch and on
  /// pull-to-refresh.
  final Future<Map<String, dynamic>> Function()? fetchBalances;

  /// Data source for balances, transactions and notifications. Defaults to a
  /// [HomeService] backed by the API client; injectable for widget tests.
  final HomeDataSource? dataSource;

  /// Balance cache. Defaults to the file-backed [BalanceCache]; injectable
  /// for widget tests. Only a cache created by the page itself is closed on
  /// dispose.
  final BalanceCache? balanceCache;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final BalanceCache _cache = widget.balanceCache ?? BalanceCache();
  late final bool _ownsCache = widget.balanceCache == null;
  late final HomeDataSource _dataSource = widget.dataSource ?? HomeService();

  CachedBalances? _cached;
  List<Map<String, dynamic>> _transactions = const [];
  List<Map<String, dynamic>> _notifications = const [];
  bool _refreshing = false;
  String? _error;

  /// Whether the first load (cache read + optional initial fetch) finished.
  bool _initialLoadDone = false;

  /// Whether the 300ms minimum skeleton window elapsed.
  bool _minSkeletonElapsed = false;

  /// True until the skeleton is dismissed in favour of real content.
  bool _showingSkeleton = true;

  Timer? _skeletonMinTimer;

  /// Acceptance criterion: the skeleton must not flash away faster than
  /// 300ms, otherwise a slow first frame reads as a flicker.
  static const Duration _minSkeletonDuration = Duration(milliseconds: 300);

  @override
  void initState() {
    super.initState();
    _skeletonMinTimer = Timer(_minSkeletonDuration, () {
      _minSkeletonElapsed = true;
      _dismissSkeletonIfReady();
    });
    _loadInitialBalances();
  }

  /// Hides the skeleton once the initial load settled AND the 300ms minimum
  /// window passed. Whichever condition arrives second wins, so a slow load
  /// keeps the skeleton for its whole duration while a fast one is held for
  /// the full 300ms.
  void _dismissSkeletonIfReady() {
    if (!_initialLoadDone || !_minSkeletonElapsed || !_showingSkeleton) {
      return;
    }
    if (!mounted) return;
    setState(() => _showingSkeleton = false);
  }

  /// Launch-time load: show cached balances immediately, then refresh them
  /// only when the legacy [HomePage.fetchBalances] seam is wired up.
  ///
  /// The dashboard data source is intentionally not called here so a
  /// logged-out launch never fires an authenticated request.
  ///
  /// Always marks the initial load as done (even when the cache read itself
  /// fails) so the skeleton can never get stuck on screen.
  Future<void> _loadInitialBalances() async {
    try {
      final cached = await _cache.read(widget.walletAddress);
      if (!mounted) return;
      setState(() => _cached = cached);

      final fetchBalances = widget.fetchBalances;
      if (fetchBalances == null) return;

      setState(() => _refreshing = true);
      try {
        final fresh = await fetchBalances();
        await _cache.write(widget.walletAddress, fresh);
        final refreshed = await _cache.read(widget.walletAddress);
        if (mounted) setState(() => _cached = refreshed);
      } catch (_) {
        // Keep whatever is cached and let the user retry via pull-to-refresh.
        if (mounted) {
          setState(() => _error = 'Could not refresh your home data.');
        }
      } finally {
        if (mounted) setState(() => _refreshing = false);
      }
    } catch (_) {
      // Cache read failed: show the skeleton-free empty state instead of
      // hanging on a blank page.
    } finally {
      _initialLoadDone = true;
      _dismissSkeletonIfReady();
    }
  }

  /// Reloads balances, transactions and notifications from the data source.
  ///
  /// Existing data stays visible for the whole flight; only a successful
  /// response replaces it. Failures keep the current data and surface an
  /// inline error with a Retry action.
  Future<void> _refreshAll() async {
    if (_refreshing) return;
    setState(() {
      _refreshing = true;
      _error = null;
    });

    try {
      final results = await Future.wait<Object?>([
        if (widget.fetchBalances != null)
          widget.fetchBalances!()
        else
          _dataSource.fetchBalances(),
        _dataSource.fetchTransactions(),
        _dataSource.fetchNotifications(),
      ]);
      final balances = results[0] as Map<String, dynamic>;
      final transactions = results[1] as List<Map<String, dynamic>>;
      final notifications = results[2] as List<Map<String, dynamic>>;

      await _cache.write(widget.walletAddress, balances);
      final refreshed = await _cache.read(widget.walletAddress);
      if (!mounted) return;
      setState(() {
        _cached = refreshed;
        _transactions = transactions;
        _notifications = notifications;
      });
    } catch (_) {
      // Refresh failed: keep showing the data we already have.
      if (!mounted) return;
      setState(() => _error = 'Could not refresh your home data.');
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  void dispose() {
    _skeletonMinTimer?.cancel();
    if (_ownsCache) _cache.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final platform = Theme.of(context).platform;
    final sections = _buildSections();
    final useCupertino =
        platform == TargetPlatform.iOS || platform == TargetPlatform.macOS;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ignition Pay'),
        centerTitle: true,
      ),
      body: useCupertino
          ? _buildCupertinoBody(sections)
          : _buildMaterialBody(sections),
    );
  }

  Widget _buildMaterialBody(List<Widget> sections) {
    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: sections,
      ),
    );
  }

  Widget _buildCupertinoBody(List<Widget> sections) {
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: _refreshAll),
        SliverPadding(
          padding: const EdgeInsets.all(20),
          sliver: SliverList(
            delegate: SliverChildListDelegate(sections),
          ),
        ),
      ],
    );
  }

  List<Widget> _buildSections() {
    if (_showingSkeleton) return const [HomeSkeleton()];

    return [
      if (_error != null) ...[
        AppErrorBanner(message: _error!),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _refreshing ? null : _refreshAll,
          child: const Text('Retry'),
        ),
        const SizedBox(height: 8),
      ],
      if (_cached?.isStale ?? false)
        const Text(
          'Showing cached balances',
          style: TextStyle(color: Colors.orange),
        ),
      if (_refreshing) const LinearProgressIndicator(),
      const SizedBox(height: 16),
      if (_cached == null)
        const Text('No cached balances yet', style: TextStyle(fontSize: 18))
      else
        ..._cached!.balances.entries.map(
          (entry) => ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(entry.key),
            trailing: Text('${entry.value}'),
          ),
        ),
      if (_transactions.isNotEmpty) ...[
        const SizedBox(height: 16),
        const Text(
          'Recent transactions',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        ..._transactions.take(5).map(
              (transaction) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                    '${transaction['amount']} ${transaction['assetCode']}'),
                trailing: Text('${transaction['status']}'),
              ),
            ),
      ],
      if (_notifications.isNotEmpty) ...[
        const SizedBox(height: 16),
        const Text(
          'Unread notifications',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        ..._notifications.take(5).map(
              (notification) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${notification['title']}'),
                trailing: Text('${notification['type']}'),
              ),
            ),
      ],
    ];
  }
}
