import 'package:flutter/material.dart';

import '../../../core/local/balance_cache.dart';

import 'history_section.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key, this.walletAddress = 'current-wallet', this.fetchBalances});

  final String walletAddress;
  final Future<Map<String, dynamic>> Function()? fetchBalances;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final BalanceCache _cache = BalanceCache();
  CachedBalances? _cached;
  bool _refreshing = false;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadBalances();
  }

  Future<void> _loadBalances({bool invalidate = false}) async {
    if (invalidate) await _cache.invalidate(widget.walletAddress);
    final cached = await _cache.read(widget.walletAddress);
    if (mounted) setState(() => _cached = cached);

    final fetchBalances = widget.fetchBalances;
    if (fetchBalances == null) return;
    if (mounted) setState(() => _refreshing = true);
    try {
      final fresh = await fetchBalances();
      await _cache.write(widget.walletAddress, fresh);
      final refreshed = await _cache.read(widget.walletAddress);
      if (mounted) setState(() => _cached = refreshed);
    } finally {
      if (mounted) setState(() => _refreshing = false);
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
      body: IndexedStack(
        index: _currentIndex,
        children: [
          _buildBalances(),
          const HistorySection(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.account_balance_wallet),
            label: 'Balances',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history),
            label: 'History',
          ),
        ],
      ),
    );
  }
}

