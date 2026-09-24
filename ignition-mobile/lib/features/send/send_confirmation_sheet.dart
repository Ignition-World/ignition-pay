import 'package:flutter/material.dart';
import '../../core/security/secure_screen_wrapper.dart';

import '../../core/haptic_service.dart';

/// Bottom sheet summarizing a pending payment before it is broadcast.
class SendConfirmationSheet extends StatelessWidget {
  final String recipient;
  final String amount;
  final String asset;
  final String fee;
  final String? memo;
  final VoidCallback onConfirm;

  /// Haptic service used for the medium confirmation cue. Defaults to
  /// [HapticService.instance] so tests can inject a mock.
  final HapticService? hapticService;

  const SendConfirmationSheet({
    super.key,
    required this.recipient,
    required this.amount,
    required this.asset,
    required this.fee,
    this.memo,
    required this.onConfirm,
    this.hapticService,
  });

  @override
  Widget build(BuildContext context) {
    final hasMemo = memo != null && memo!.isNotEmpty;
    return SecureScreenWrapper(
      child: SafeArea(
        child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Review payment', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          _row(context, 'Recipient', recipient),
          _row(context, 'Amount', '$amount $asset'),
          _row(context, 'Network fee', fee),
          if (hasMemo) _row(context, 'Memo', memo!),
          const SizedBox(height: 24),
          SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () {
                  (hapticService ?? HapticService.instance).mediumImpact();
                  onConfirm();
                },
                child: const Text('Slide to send'),
              )),
        ]),
      ),
    ),
    );
  }

  Widget _row(BuildContext context, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
          Flexible(child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
          const SizedBox(width: 16),
          Flexible(child: Text(value, textAlign: TextAlign.end)),
        ]),
      );
}
