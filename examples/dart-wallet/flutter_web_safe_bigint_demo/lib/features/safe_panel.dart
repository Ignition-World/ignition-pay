import 'package:flutter/material.dart';

class SafePanel extends StatelessWidget {
  const SafePanel({super.key});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        // Simulate a refresh task
        await Future<void>.delayed(const Duration(seconds: 1));
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          children: const [
            Text('BigInt (stellar_address_kit)', style: TextStyle(fontWeight: FontWeight.bold)),
            Text('Placeholder for safe panel content'),
          ],
        ),
      ),
    );
  }
}
