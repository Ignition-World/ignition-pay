import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/local/balance_cache.dart';
import '../../../core/network/api_exception.dart';
import '../services/home_service.dart';
import 'history_section.dart';

/// Home dashboard with pull-to-refresh.
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
  List<Map<String, dynamic>> _transactions = const <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _notifications = const <Map<String, dynamic>>[];

  /// True while the launch-time balance load is in flight.
  bool _loading = false;

  /// True while a pull-to-refresh is in flight.
  bool _refreshing = false;

  /// True while the user explicitly triggered a retry.
  bool _retrying = false;

  /// Non-null when the launch-time load failed. Rendered as a full-screen
  /// [ErrorStateView] because there is nothing else to show.
  ApiException? _loadError;

  /// True when the last pull-to-refresh failed. Rendered as an inline banner
  /// on top of the data the user already had.
  bool _refreshFailed = false;

  @override
  void initState() {
    super.initState();
    _loadInitialBalances();
  }

  /// Launch path: read the cache so the screen is never blank, then fetch
  /// balances when the legacy [HomePage.fetchBalances] seam is provided.
  Future<void> _loadInitialBalances({bool isRetry = false}) async {
    final cached = await _cache.read(widget.walletAddress);
    if (!mounted) return;
    setState(() => _cached = cached);

    final fetchBalances = widget.fetchBalances;
    if (fetchBalances == null) return;

    if (mounted) {
      setState(() {
        _loading = true;
        _retrying = isRetry;
      });
    }

    try {
      final fresh = await fetchBalances();
      await _cache.write(widget.walletAddress, fresh);
      final refreshed = await _cache.read(widget.walletAddress);
      // The error is only cleared once the retry actually succeeds, so the
      // error view keeps showing the in-button spinner while it is in flight.
      if (mounted) {
        setState(() {
          _cached = refreshed;
          _loadError = null;
        });
      }
    } on UnauthorizedException {
      // 401 — session expired; redirect to login instead of showing retry.
      if (mounted) {
        context.go('/login');
      }
      return;
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e);
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _retrying = false;
        });
      }
    }
  }

  /// Pull-to-refresh: drop the cached balances and reload all three slices.
  Future<void> _refreshAll() async {
    if (_refreshing) return;

    setState(() {
      _refreshing = true;
      _refreshFailed = false;
    });

    try {
      await _cache.invalidate(widget.walletAddress);

      final results = await Future.wait(<Future<Object?>>[
        _fetchBalances(),
        _dataSource.fetchTransactions(),
        _dataSource.fetchNotifications(),
      ]);

      final balances = results[0]! as Map<String, dynamic>;
      await _cache.write(widget.walletAddress, balances);
      final refreshed = await _cache.read(widget.walletAddress);
      if (!mounted) return;
      setState(() {
        _cached = refreshed;
        _transactions = results[1]! as List<Map<String, dynamic>>;
        _notifications = results[2]! as List<Map<String, dynamic>>;
      });
    } on UnauthorizedException {
      if (mounted) {
        context.go('/login');
      }
    } on Exception {
      // Keep whatever is on screen; the banner explains why it is stale.
      if (mounted) setState(() => _refreshFailed = true);
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<Map<String, dynamic>> _fetchBalances() {
    final fetchBalances = widget.fetchBalances;
    return fetchBalances != null
        ? fetchBalances()
        : _dataSource.fetchBalances();
  }

  @override
  void dispose() {
    if (_ownsCache) _cache.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ignition Pay'),
        centerTitle: true,
      ),
      body: _loadError != null
          ? ErrorStateView(
              key: const Key('home_error_state'),
              error: _loadError!,
              retrying: _retrying,
              onRetry: () => _loadInitialBalances(isRetry: true),
            )
          : _buildRefreshableBody(),
    );
  }

  /// Material [RefreshIndicator] on Android, Cupertino sliver refresh control
  /// on iOS/macOS.
  Widget _buildRefreshableBody() {
    final platform = Theme.of(context).platform;
    final useCupertino =
        platform == TargetPlatform.iOS || platform == TargetPlatform.macOS;

    if (useCupertino) {
      return CustomScrollView(
        slivers: [
          CupertinoSliverRefreshControl(onRefresh: _refreshAll),
          SliverList(
            delegate: SliverChildListDelegate(_buildSections()),
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: _refreshAll,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: _buildSections(),
      ),
    );
  }

  List<Widget> _buildSections() {
    return <Widget>[
      if (_refreshFailed) ...[
        const AppErrorBanner(
          message: 'Could not refresh. Showing the latest saved data.',
        ),
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
      if (_refreshing || _loading) const LinearProgressIndicator(),
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
