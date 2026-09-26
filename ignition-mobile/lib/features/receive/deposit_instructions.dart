// Deposit instructions widget (Issue #463).
// Shows per-asset deposit instructions on the Receive page.

import 'package:flutter/material.dart';

class DepositInstructions extends StatelessWidget {
  final String assetCode;
  final String depositAddress;
  final String? memo;

  const DepositInstructions({
    super.key,
    required this.assetCode,
    required this.depositAddress,
    this.memo,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Deposit $assetCode', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Text('Address: $depositAddress'),
        if (memo != null) Text('Memo: $memo'),
      ],
    );
  }
}