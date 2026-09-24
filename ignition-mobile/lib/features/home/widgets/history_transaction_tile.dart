import 'package:flutter/material.dart';

import '../../../core/widgets/copyable_address.dart';
import '../pages/history_data_source.dart';

class HistoryTransactionTile extends StatelessWidget {
  const HistoryTransactionTile({super.key, required this.transaction});

  final HistoryTransaction transaction;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text('${transaction.amount} ${transaction.assetCode}'),
      subtitle: transaction.counterpartyAddress == null
          ? Text(transaction.status)
          : CopyableAddress(address: transaction.counterpartyAddress!),
      trailing: Text(transaction.status),
    );
  }
}