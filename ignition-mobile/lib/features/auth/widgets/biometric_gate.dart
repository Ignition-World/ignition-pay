import 'dart:async';

import 'package:flutter/material.dart';

import '../services/biometric_service.dart';

/// Locks its [child] behind a biometric prompt.
///
/// * Prompts on cold start when the user has enrolled biometrics.
/// * Re-checks (and re-locks) every time the app is resumed (issue #676).
/// * Falls back to the device PIN/password because [BiometricService]
///   authenticates with `biometricOnly: false`.
class BiometricGate extends StatefulWidget {
  const BiometricGate({
    super.key,
    required this.child,
    required this.biometricService,
    this.reason = 'Unlock Ignition Pay',
    this.relockOnResume = true,
  });

  /// Content revealed once the user is authenticated.
  final Widget child;

  final BiometricService biometricService;

  /// Message shown in the platform prompt.
  final String reason;

  /// Whether returning to the foreground should re-prompt. Disabled in tests
  /// that don't simulate lifecycle events.
  final bool relockOnResume;

  @override
  State<BiometricGate> createState() => _BiometricGateState();
}

class _BiometricGateState extends State<BiometricGate>
    with WidgetsBindingObserver {
  bool _locked = false;
  bool _evaluating = true;
  bool _prompting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_evaluate());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!widget.relockOnResume) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(_evaluate());
    }
  }

  /// Decides whether the app must be locked, then prompts if so.
  Future<void> _evaluate() async {
    final enabled = await widget.biometricService.isEnabled();
    final supported =
        enabled && await widget.biometricService.isSupported();

    if (!mounted) return;
    setState(() {
      _locked = supported;
      _evaluating = false;
    });

    if (supported) {
      await _prompt();
    }
  }

  Future<void> _prompt() async {
    if (_prompting) return;
    _prompting = true;
    try {
      final result =
          await widget.biometricService.authenticate(reason: widget.reason);
      if (!mounted) return;
      if (result == BiometricAuthResult.success) {
        setState(() => _locked = false);
      }
    } finally {
      _prompting = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_evaluating) {
      return const Scaffold(
        key: Key('biometric_checking'),
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (!_locked) return widget.child;
    return _BiometricLockScreen(onUnlock: _prompt);
  }
}

/// Lock screen shown while the app is awaiting authentication.
class _BiometricLockScreen extends StatelessWidget {
  const _BiometricLockScreen({required this.onUnlock});

  final Future<void> Function() onUnlock;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('biometric_lock_screen'),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.fingerprint, size: 72),
              const SizedBox(height: 16),
              Text(
                'Ignition Pay is locked',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Unlock with your fingerprint, Face ID, or your device PIN.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton(
                key: const Key('biometric_unlock_button'),
                onPressed: () => unawaited(onUnlock()),
                child: const Text('Unlock'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
