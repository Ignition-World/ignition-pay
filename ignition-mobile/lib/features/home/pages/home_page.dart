import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/local/balance_cache.dart';
import '../../../core/network/api_exception.dart';

import 'history_section.dart';

class HomePage extends StatefulWidget {
  const HomePage({
    super.key,
    this.walletAddress = 'current-wallet',
    this.fetchBalances,
  });

  final String walletAddress;
  final Future<Map<String, dynamic>> Function()? fetchBalances;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final BalanceCache _cache = BalanceCache();
  CachedBalances? _cached;

  /// True while the background fetch is in progress.
  bool _loading = false;

  /// True while the user explicitly triggered a retry.
  bool _retrying = false;

  /// Non-null when the most recent fetch failed.
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _loadBalances();
  }

  Future<void> _loadBalances({
    bool invalidate = false,
    bool isRetry = false,
  }) async {
    if (invalidate) await _cache.invalidate(widget.walletAddress);

    // Read whatever is in the cache first so the screen is never blank.
    final cached = await _cache.read(widget.walletAddress);
    if (mounted) setState(() => _cached = cached);

    final fetchBalances = widget.fetchBalances;
    if (fetchBalances == null) return;

    if (mounted) {
      setState(() {
        _loading = true;
        _retrying = isRetry;
        _error = null;
      });
    }

    try {
      final fresh = await fetchBalances();
      await _cache.write(widget.walletAddress, fresh);
      final refreshed = await _cache.read(widget.walletAddress);
      if (mounted) setState(() => _cached = refreshed);
    } on UnauthorizedException {
      // 401 — session expired; redirect to login instead of showing retry.
      if (mounted) {
        context.go('/login');
      }
      return;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() {
        _loading = false;
        _retrying = false;
      });
    }
  }

  @override
  void dispose() {
    _cache.close();
    super.dispose();
  }

  Widget _buildBalances() {
    return RefreshIndicator(
      onRefresh: () => _loadBalances(invalidate: true),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (_cached?.isStale ?? false)
            const Text('Showing cached balances', style: TextStyle(color: Colors.orange)),
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
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ignition Pay'),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadBalances(invalidate: true),
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    // Show error state when the fetch failed and we have no cache to fall back
    // on, or when a previous cached load followed by a failure should still
    // surface the error UI.
    if (_error != null) {
      return ListView(
        children: [
          // If stale data is available, show it above the error banner so the
          // user still sees something useful.
          if (_cached != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Showing cached balances',
                    style: TextStyle(color: Colors.orange),
                  ),
                  const SizedBox(height: 8),
                  ..._cached!.balances.entries.map(
                    (entry) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(entry.key),
                      trailing: Text('${entry.value}'),
                    ),
                  ),
                ],
              ),
            ),
          ],
          ErrorStateView(
            key: const Key('home_error_state'),
            error: _error!,
            retrying: _retrying,
            onRetry: () => _loadBalances(invalidate: true, isRetry: true),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (_cached?.isStale ?? false)
          const Text(
            'Showing cached balances',
            style: TextStyle(color: Colors.orange),
          ),
        if (_loading) const LinearProgressIndicator(),
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
      ],
    );
  }
}

