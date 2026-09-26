import 'package:flutter/material.dart';

import '../../home/pages/history_section.dart';

/// Activity tab: the full transaction history with its filters, search and
/// swipe actions.
///
/// The list, its data source and its gestures already live in
/// [HistorySection], which the Home page embeds; this page hosts the same
/// section full-screen as one of the five navigation sections (#690).
class ActivityPage extends StatelessWidget {
  const ActivityPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: const HistorySection(),
    );
  }
}
