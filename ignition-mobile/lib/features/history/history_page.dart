import 'package:flutter/material.dart';

import '../../features/home/pages/history_section.dart';

class HistoryPage extends StatelessWidget {
  const HistoryPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: const HistorySection(),
    );
  }
}