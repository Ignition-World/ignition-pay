import 'package:flutter/material.dart';

import '../haptic_service.dart';

/// Inline error banner for failed transactions and invalid input.
///
/// Fires a heavy haptic impact exactly once, as soon as the banner is shown,
/// so the user gets immediate tactile feedback that something went wrong. The
/// cue is played from [initState] rather than [build] to avoid repeating it on
/// every rebuild.
class AppErrorBanner extends StatefulWidget {
  const AppErrorBanner({
    super.key,
    required this.message,
    this.hapticService,
  });

  final String message;

  /// Haptic service used for the heavy error cue. Defaults to
  /// [HapticService.instance] so tests can inject a mock.
  final HapticService? hapticService;

  @override
  State<AppErrorBanner> createState() => _AppErrorBannerState();
}

class _AppErrorBannerState extends State<AppErrorBanner> {
  @override
  void initState() {
    super.initState();
    (widget.hapticService ?? HapticService.instance).heavyImpact();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: colors.onErrorContainer, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              widget.message,
              style: TextStyle(color: colors.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}
