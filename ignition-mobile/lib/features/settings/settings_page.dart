import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/services/biometric_services.dart';
import '../../features/settings/pages/security_settings_page.dart';
import '../../features/wallet_connect/pages/wallet_connect_page.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.link),
            title: const Text('WalletConnect'),
            subtitle: const Text('Connect DApps and manage sessions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/wallet-connect'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.security),
            title: const Text('Security'),
            subtitle: const Text('Biometric unlock and security settings'),
            onTap: () => Navigator.of(context).push<void>(
              MaterialPageRoute<void>(
                builder: (_) => SecuritySettingsPage(
                  biometricService: BiometricServices.service,
                ),
              ),
            ),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.notifications),
            title: const Text('Notifications'),
            subtitle: const Text('Manage notification preferences'),
            onTap: () {},
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.info),
            title: const Text('About'),
            subtitle: const Text('App version and legal information'),
            onTap: () {},
          ),
        ],
      ),
    );
  }
}