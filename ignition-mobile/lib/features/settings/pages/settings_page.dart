import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Settings tab: the entry point for the app's settings sections (#690).
///
/// Deliberately a short, honest list. Each entry is a screen that already
/// exists; nothing here invents a feature.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        key: const Key('settings_list'),
        children: [
          ListTile(
            key: const Key('settings_security'),
            leading: const Icon(Icons.security_outlined),
            title: const Text('Security'),
            subtitle: const Text('Biometric lock and app security'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/security'),
          ),
          ListTile(
            key: const Key('settings_pending_sends'),
            leading: const Icon(Icons.schedule_outlined),
            title: const Text('Pending sends'),
            subtitle: const Text('Transactions waiting to be submitted'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/pending-sends'),
          ),
        ],
      ),
    );
  }
}
