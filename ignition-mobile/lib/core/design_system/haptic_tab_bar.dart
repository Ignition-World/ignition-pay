import 'package:flutter/material.dart';

import '../haptic_service.dart';

/// A [TabBar] that fires a light haptic cue when a tab is selected.
///
/// Expected to be used under a [DefaultTabController] like a regular [TabBar].
class HapticTabBar extends StatelessWidget {
  const HapticTabBar({
    super.key,
    required this.tabs,
    this.onTap,
    this.hapticService,
  });

  final List<Widget> tabs;

  /// Optional callback forwarded the index of the tapped tab.
  final ValueChanged<int>? onTap;

  /// Haptic service used for the light tab-selection cue. Defaults to
  /// [HapticService.instance] so tests can inject a mock.
  final HapticService? hapticService;

  @override
  Widget build(BuildContext context) {
    return TabBar(
      tabs: tabs,
      onTap: (index) {
        (hapticService ?? HapticService.instance).lightImpact();
        onTap?.call(index);
      },
    );
  }
}
