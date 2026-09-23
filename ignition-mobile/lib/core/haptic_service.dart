import 'package:flutter/services.dart';

/// The haptic intensities exposed by the Flutter SDK, plus the dedicated
/// selection cue used by pickers, dropdowns and segmented controls.
enum HapticType {
  /// Light tap — toggles, tab selection and copy-to-clipboard.
  light,

  /// Firmer cue — send button press and confirmation success.
  medium,

  /// Strong cue — errors, failed transactions and invalid input.
  heavy,

  /// Selection click — pickers and dropdowns.
  selection,
}

/// Thin, injectable wrapper around the Flutter SDK's [HapticFeedback].
///
/// Every haptic cue in the app flows through this single seam so that:
///  * each call uses an SDK primitive (no custom platform channels), and
///  * widgets can be exercised in tests with a mock implementation.
///
/// Graceful degradation: [HapticFeedback] is a no-op on platforms/devices
/// without a haptic engine (e.g. older iPads) and when the user turns haptics
/// off in the OS accessibility settings — both are enforced by the platform
/// itself. This wrapper additionally swallows [MissingPluginException] so a
/// platform without an implementation never crashes the calling widget.
class HapticService {
  HapticService({bool enabled = true}) : _enabled = enabled;

  /// Shared instance used by widgets when none is injected. Tests can replace
  /// this with a mock before pumping a widget tree.
  static HapticService instance = HapticService();

  bool _enabled;

  /// Whether haptics are allowed to fire. This reflects an in-app preference;
  /// the OS-level accessibility setting is enforced by the platform regardless
  /// of this flag.
  bool get enabled => _enabled;

  set enabled(bool value) => _enabled = value;

  /// Alias for [enabled] that reads naturally in conditionals.
  bool get isEnabled => _enabled;

  /// Light tap — toggles, tab selection and copy-to-clipboard.
  Future<void> lightImpact() => trigger(HapticType.light);

  /// Medium tap — send button press and confirmation success.
  Future<void> mediumImpact() => trigger(HapticType.medium);

  /// Heavy tap — error states, failed transactions and invalid input.
  Future<void> heavyImpact() => trigger(HapticType.heavy);

  /// Selection click — pickers, dropdowns and segmented controls.
  Future<void> selectionClick() => trigger(HapticType.selection);

  /// Plays the SDK cue matching [type].
  ///
  /// No-ops when [isEnabled] is false, and silently ignores platforms that do
  /// not implement the haptic channel.
  Future<void> trigger(HapticType type) async {
    if (!_enabled) return;
    try {
      switch (type) {
        case HapticType.light:
          await HapticFeedback.lightImpact();
        case HapticType.medium:
          await HapticFeedback.mediumImpact();
        case HapticType.heavy:
          await HapticFeedback.heavyImpact();
        case HapticType.selection:
          await HapticFeedback.selectionClick();
      }
    } on MissingPluginException {
      // No haptic engine on this platform/device — degrade gracefully.
    }
  }
}
