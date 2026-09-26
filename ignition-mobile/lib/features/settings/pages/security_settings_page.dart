import 'package:flutter/material.dart';

import '../../auth/services/biometric_service.dart';

/// Settings screen exposing the biometric unlock opt-in (issue #676).
class SecuritySettingsPage extends StatefulWidget {
  const SecuritySettingsPage({super.key, required this.biometricService});

  final BiometricService biometricService;

  @override
  State<SecuritySettingsPage> createState() => _SecuritySettingsPageState();
}

class _SecuritySettingsPageState extends State<SecuritySettingsPage> {
  bool _supported = false;
  bool _enabled = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final supported = await widget.biometricService.isSupported();
    final enabled = await widget.biometricService.isEnabled();
    if (!mounted) return;
    setState(() {
      _supported = supported;
      _enabled = enabled;
      _loading = false;
    });
  }

  Future<void> _setEnabled(bool value) async {
    await widget.biometricService.setEnabled(value);
    if (!mounted) return;
    setState(() => _enabled = value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                SwitchListTile(
                  key: const Key('biometric_toggle'),
                  value: _enabled,
                  onChanged: _supported ? _setEnabled : null,
                  title: const Text('Unlock with biometrics'),
                  subtitle: Text(
                    _supported
                        ? 'Use your fingerprint or Face ID to unlock the app.'
                        : 'Biometrics are not available on this device.',
                  ),
                  secondary: const Icon(Icons.fingerprint),
                ),
              ],
            ),
    );
  }
}
