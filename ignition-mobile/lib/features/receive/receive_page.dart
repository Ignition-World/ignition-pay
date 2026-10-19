import 'package:flutter/material.dart';

import '../../core/design_system/design_system.dart';

class ReceivePage extends StatelessWidget {
  const ReceivePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Receive')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.download, size: 64, color: AppColors.muted),
            SizedBox(height: 16),
            Text('Receive Page', style: TextStyle(fontSize: 24)),
            SizedBox(height: 8),
            Text('Deposit functionality coming soon', style: TextStyle(color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}