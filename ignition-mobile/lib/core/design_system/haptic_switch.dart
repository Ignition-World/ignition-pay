import 'package:flutter/material.dart';

import '../haptic_service.dart';

/// A [Switch] that fires a light haptic cue whenever the user toggles it.
///
/// Wrapping the toggle in the design system keeps the haptic behaviour
/// consistent across screens and lets tests inject a [HapticService] mock.
class HapticSwitch extends StatelessWidget {
  const HapticSwitch({
    super.key,
    required this.value,
    required this.onChanged,
    this.hapticService,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;

  /// Haptic service used for the light toggle cue. Defaults to
  /// [HapticService.instance] so tests can inject a mock.
  final HapticService? hapticService;

  @override
  Widget build(BuildContext context) {
    return Switch(
      value: value,
      onChanged: onChanged == null
          ? null
          : (next) {
              (hapticService ?? HapticService.instance).lightImpact();
              onChanged!(next);
            },
    );
  }
}
