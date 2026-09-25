import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/copyable_address.dart';
import '../pages/history_data_source.dart';

class HistoryTransactionTile extends StatelessWidget {
  const HistoryTransactionTile({super.key, required this.transaction});

  final HistoryTransaction transaction;

  @override
  Widget build(BuildContext context) {
    final isOut = transaction.amount.startsWith('-');
    final direction = isOut ? 'Out' : 'In';
    final parsedAmount = double.tryParse(transaction.amount) ?? 0.0;
    
    // Formatting amounts per locale.
    final formattedAmount = NumberFormat.decimalPattern().format(parsedAmount.abs());
    final formattedDate = DateFormat.yMMMd().add_jm().format(transaction.createdAt);

    return ListTile(
      title: Text('$direction: $formattedAmount ${transaction.assetCode}'),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(formattedDate),
          if (transaction.counterpartyAddress != null)
            CopyableAddress(address: transaction.counterpartyAddress!),
        ],
      ),
      trailing: Text(transaction.status, style: TextStyle(
        color: transaction.status.toLowerCase() == 'failed' ? Colors.red : 
               transaction.status.toLowerCase() == 'pending' ? Colors.orange : Colors.green,
      )),
    );
  }
}