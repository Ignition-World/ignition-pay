import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../haptic_service.dart';

/// The five top-level sections of the app.
enum AppSection {
  home('Home', Icons.home_outlined, Icons.home),
  send('Send', Icons.send_outlined, Icons.send),
  receive('Receive', Icons.call_received_outlined, Icons.call_received),
  activity('Activity', Icons.receipt_long_outlined, Icons.receipt_long),
  settings('Settings', Icons.settings_outlined, Icons.settings);

  const AppSection(this.label, this.icon, this.selectedIcon);

  /// Visible label, also used as the accessibility label for the destination.
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  /// Index of this section in the shell, used as the branch index.
  ///
  /// Named to avoid clashing with [Enum.index].
  int get branchIndex => AppSection.values.indexOf(this);

  /// Section for a branch index, or null when the index is out of range.
  static AppSection? fromIndex(int index) {
    if (index < 0 || index >= values.length) return null;
    return values[index];
  }
}

/// Persistent navigation shell: the branch content plus a bottom navigation bar
/// that is identical on every screen (#690).
///
/// The bar is a [NavigationBar] rather than a [BottomNavigationBar] because
/// each destination carries a visible label, which is what TalkBack and
/// VoiceOver read out; icons alone are not enough for a five-item bar.
///
/// There is deliberately no transition animation between tabs: the shell uses
/// a [StatefulShellRoute] with an indexed stack so that each branch keeps its
/// own navigation stack and scroll position, and a cross-fade would rebuild
/// the branch being faded out, throwing that state away.
class AppShell extends StatelessWidget {
  const AppShell({
    super.key,
    required this.navigationShell,
    this.hapticService,
  });

  final StatefulNavigationShell navigationShell;

  /// Defaults to [HapticService.instance]; injected by tests.
  final HapticService? hapticService;

  /// Tapping a destination switches to that branch, restoring its stack.
  /// Tapping the destination of the current branch pops it back to its root,
  /// which is the behaviour users expect from a tab bar.
  void _onDestinationSelected(BuildContext context, int index) {
    (hapticService ?? HapticService.instance).lightImpact();
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  /// Handles a system back gesture that reached the shell, i.e. one that no
  /// branch navigator could consume.
  ///
  /// Back must never close the app from a secondary tab: the user expects to
  /// land on Home first, and only a second back press from the root of Home
  /// leaves the app (that case is handled by [canPop] below).
  void _onSystemBack() {
    navigationShell.goBranch(
      AppSection.home.index,
      initialLocation: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final current = AppSection.fromIndex(navigationShell.currentIndex);

    return PopScope<Object?>(
      // The system back gesture is only allowed to leave the app from the root
      // of Home. Anywhere else it is routed to Home by [_onSystemBack].
      canPop: current == AppSection.home,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _onSystemBack();
      },
      child: Scaffold(
        body: navigationShell,
        bottomNavigationBar: NavigationBar(
          key: const Key('app_bottom_nav'),
          selectedIndex: navigationShell.currentIndex,
          onDestinationSelected: (index) =>
              _onDestinationSelected(context, index),
          destinations: <Widget>[
            for (final section in AppSection.values)
              // The semantics wrapper makes the announcement deterministic:
              // the destination is announced as "<label>, button" instead of
              // depending on how Material merges the icon and the label text
              // for the selected state.
              Semantics(
                container: true,
                label: section.label,
                child: NavigationDestination(
                  key: Key('nav_destination_${section.name}'),
                  icon: Icon(section.icon),
                  selectedIcon: Icon(section.selectedIcon),
                  label: section.label,
                  tooltip: section.label,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
