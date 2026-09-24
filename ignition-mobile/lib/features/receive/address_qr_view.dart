import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/security/secure_screen_wrapper.dart';
import '../../core/widgets/copyable_address.dart';

import '../../core/haptic_service.dart';

/// Displays the wallet's deposit [address] as a scannable QR tile
/// alongside a copy-to-clipboard action, for use on `ReceivePage`.
class AddressQrView extends StatelessWidget {
  final String address;

  /// Haptic service used for the light copy confirmation cue. Defaults to
  /// [HapticService.instance] so tests can inject a mock.
  final HapticService? hapticService;

  const AddressQrView({
    super.key,
    required this.address,
    this.hapticService,
  });

  @override
  Widget build(BuildContext context) {
    return SecureScreenWrapper(
      child: Column(
      children: [
        Container(
          width: 200,
          height: 200,
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Center(
            child: Semantics(
              image: true,
              label: 'QR Code for deposit address',
              child: Icon(Icons.qr_code_2, size: 120),
            ),
          ),
        ),
        const SizedBox(height: 12),
        CopyableAddress(address: address, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: address));
            (hapticService ?? HapticService.instance).lightImpact();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Address copied')),
            );
          },
          icon: const Icon(Icons.copy, size: 16),
          label: const Text('Copy'),
        ),
      ],
    ),
    );
  }
}

