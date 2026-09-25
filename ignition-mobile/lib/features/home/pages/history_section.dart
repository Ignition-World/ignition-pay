import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'history_data_source.dart';
import '../widgets/history_transaction_tile.dart';
import 'package:go_router/go_router.dart';

class HistorySection extends StatefulWidget {
  const HistorySection({super.key});

  @override
  State<HistorySection> createState() => _HistorySectionState();
}

class _HistorySectionState extends State<HistorySection> {
  final HistoryDataSource _dataSource = HistoryDataSource();
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();

  List<HistoryTransaction> _transactions = [];
  bool _isLoading = false;
  bool _hasError = false;
  bool _hasMore = true;
  String _selectedFilter = 'All';
  String _searchQuery = '';
  
  static const List<String> _filters = ['All', 'Sent', 'Received', 'Pending', 'Failed', 'Confirmed'];

  @override
  void initState() {
    super.initState();
    _loadInitialData();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200 &&
        !_isLoading &&
        _hasMore) {
      _loadMoreData();
    }
  }

  Future<void> _loadInitialData() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
      _transactions.clear();
      _hasMore = true;
    });

    try {
      final data = await _dataSource.fetchTransactions(
        offset: 0,
        filter: _selectedFilter,
        searchQuery: _searchQuery,
      );
      setState(() {
        _transactions = data;
        _isLoading = false;
        if (data.length < 20) _hasMore = false;
      });
    } catch (e) {
      setState(() {
        _hasError = true;
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMoreData() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final data = await _dataSource.fetchTransactions(
        offset: _transactions.length,
        filter: _selectedFilter,
        searchQuery: _searchQuery,
      );
      setState(() {
        _transactions.addAll(data);
        _isLoading = false;
        if (data.length < 20) _hasMore = false;
      });
    } catch (e) {
      setState(() {
        _hasError = true;
        _isLoading = false;
      });
    }
  }

  void _onSearchChanged(String value) {
    setState(() {
      _searchQuery = value;
    });
    _loadInitialData();
  }

  void _onFilterChanged(String filter) {
    setState(() {
      _selectedFilter = filter;
    });
    _loadInitialData();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Search by hash, amount, or contact',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            onChanged: _onSearchChanged,
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _filters.length,
            itemBuilder: (context, index) {
              final filter = _filters[index];
              final isSelected = _selectedFilter == filter;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(filter),
                  selected: isSelected,
                  onSelected: (selected) {
                    if (selected) _onFilterChanged(filter);
                  },
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _hasError
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('Failed to load transactions'),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadInitialData,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadInitialData,
                  child: _transactions.isEmpty && !_isLoading
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [
                            SizedBox(height: 100),
                            Center(
                              child: Text(
                                'No transactions found',
                                style: TextStyle(fontSize: 16, color: Colors.grey),
                              ),
                            ),
                          ],
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: _transactions.length + (_isLoading ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == _transactions.length) {
                              return const Padding(
                                padding: EdgeInsets.all(16.0),
                                child: Center(child: CircularProgressIndicator()),
                              );
                            }
                            final tx = _transactions[index];
                            return InkWell(
                              onTap: () {
                                context.push('/transaction/${tx.id}');
                              },
                              child: HistoryTransactionTile(transaction: tx),
                            );
                          },
                        ),
                ),
        ),
      ],
    );
  }
}
