import 'package:flutter/material.dart';
import 'features/unsafe_panel.dart';
import 'features/safe_panel.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width > 600;

    return Scaffold(
      appBar: AppBar(title: const Text('Safe BigInt Demo')),
      body: RefreshIndicator(
        onRefresh: () async {},
        child: isWide
            ? SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: MediaQuery.sizeOf(context).height),
                  child: Row(
                    children: const [
                      Expanded(child: UnsafePanel()),
                      VerticalDivider(),
                      Expanded(child: SafePanel()),
                    ],
                  ),
                ),
              )
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  UnsafePanel(),
                  Divider(),
                  SafePanel(),
                ],
              ),
      ),
    );
  }
}
