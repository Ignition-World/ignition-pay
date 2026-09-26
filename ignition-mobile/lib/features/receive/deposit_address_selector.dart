import 'package:flutter/material.dart';

import '../../core/haptic_service.dart';

/// A single saved deposit address the user can choose to display.
class DepositAddress {
  final String label;
  final String address;
  final String network;

  const DepositAddress({
    required this.label,
    required this.address,
    required this.network,
  });
}

/// Lets the user pick which [DepositAddress] to display when they have
/// more than one on file.
class DepositAddressSelector extends StatelessWidget {
  final List<DepositAddress> addresses;
  final DepositAddress? selected;
  final ValueChanged<DepositAddress> onSelected;

  /// Haptic service used for the selection cue. Defaults to
  /// [HapticService.instance] so tests can inject a mock.
  final HapticService? hapticService;

  const DepositAddressSelector({
    super.key,
    required this.addresses,
    required this.selected,
    required this.onSelected,
    this.hapticService,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<DepositAddress>(
      value: selected,
      decoration: const InputDecoration(
        labelText: 'Deposit address',
        border: OutlineInputBorder(),
      ),
      items: addresses
          .map((a) => DropdownMenuItem(
                value: a,
                child: Text('${a.label} (${a.network})'),
              ))
          .toList(),
      onChanged: (value) {
        if (value != null) {
          (hapticService ?? HapticService.instance).selectionClick();
          onSelected(value);
        }
      },
    );
  }
}
