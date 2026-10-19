// History data source (Issue #464).
// Replaces the mock data on the History page with a contract for real API data.
// Wire this provider to the actual transactions endpoint.

class HistoryTransaction {
  final String id;
  final String assetCode;
  final String amount;
  final String status;
  final String? counterpartyAddress;
  final DateTime createdAt;

  const HistoryTransaction({
    required this.id,
    required this.assetCode,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.counterpartyAddress,
  });

  factory HistoryTransaction.fromJson(Map<String, dynamic> json) {
    return HistoryTransaction(
      id: json['id'] as String,
      assetCode: json['assetCode'] as String,
      amount: json['amount'] as String,
      status: json['status'] as String,
      counterpartyAddress: json['counterpartyAddress'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class HistoryDataSource {
  static final List<HistoryTransaction> _mockData = List.generate(
    100,
    (index) {
      final isOut = index % 3 == 0;
      final amountVal = (index * 12.5 + 5).toStringAsFixed(2);
      return HistoryTransaction(
        id: 'tx_hash_$index',
        assetCode: index % 2 == 0 ? 'USDC' : 'XLM',
        amount: isOut ? '-$amountVal' : amountVal,
        status: index % 5 == 0 ? 'Failed' : (index % 4 == 0 ? 'Pending' : 'Confirmed'),
        createdAt: DateTime.now().subtract(Duration(hours: index * 2)),
        counterpartyAddress: index % 2 == 0 ? 'GABCD123$index' : null,
      );
    },
  );

  Future<List<HistoryTransaction>> fetchTransactions({
    int offset = 0,
    int limit = 20,
    String filter = 'All',
    String searchQuery = '',
  }) async {
    await Future.delayed(const Duration(milliseconds: 500));
    var data = _mockData.where((tx) {
      if (filter != 'All') {
        if (filter == 'Sent' && !tx.amount.startsWith('-')) return false;
        if (filter == 'Received' && tx.amount.startsWith('-')) return false;
        if (filter == 'Pending' && tx.status.toLowerCase() != 'pending') return false;
        if (filter == 'Failed' && tx.status.toLowerCase() != 'failed') return false;
        if (filter == 'Confirmed' && tx.status.toLowerCase() != 'confirmed') return false;
      }
      if (searchQuery.isNotEmpty) {
        final query = searchQuery.toLowerCase();
        if (!tx.id.toLowerCase().contains(query) &&
            !tx.amount.toLowerCase().contains(query) &&
            !(tx.counterpartyAddress?.toLowerCase().contains(query) ?? false)) {
          return false;
        }
      }
      return true;
    }).toList();
    
    if (offset >= data.length) return [];
    return data.sublist(offset, (offset + limit) > data.length ? data.length : offset + limit);
  }
}