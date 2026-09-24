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