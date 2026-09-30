import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'device_performance_tier.dart';
import 'performance_tier_cache.dart';

/// Effective motion policy for a screen (issue #709).
enum MotionMode {
  /// Full 60fps slide/zoom transitions and heroes (high and medium tiers).
  full,

  /// Cheap cross-fades, no hero flights and a capped shimmer (low tier, or
  /// any tier when the OS asks for reduced motion).
  reduced,
}

/// Immutable snapshot of the resolved motion policy handed to the widget tree.
///
/// Distinguishes the two reasons motion is reduced so widgets can react
/// appropriately:
///
///  * [reduceMotion] — the user asked the OS to reduce/remove animations
///    (accessibility). Decorative animation is switched off entirely.
///  * `tier == low` — slow hardware. Motion is kept but made cheap: fades
///    instead of slides, no hero flights, shimmer capped at 30fps.
@immutable
class MotionPolicy {
  const MotionPolicy({
    required this.tier,
    required this.reduceMotion,
  });

  /// The device performance tier.
  final DevicePerformanceTier tier;

  /// Whether the OS accessibility setting asks for reduced motion.
  final bool reduceMotion;

  /// Whether a [Hero] flight may run.
  bool get heroesEnabled => !reduceMotion && tier.useHeroAnimations;

  /// Whether page routes should use a single cross-fade instead of the
  /// platform slide/zoom transition.
  bool get useFadeTransitions => reduceMotion || !tier.useFullPageTransitions;

  /// Whether transitions should be skipped altogether. Only the explicit
  /// accessibility request removes motion completely; a slow device still
  /// gets a short fade.
  bool get skipTransitions => reduceMotion;

  /// Whether a looping decorative animation (shimmer) should run at all.
  ///
  /// It still runs on a low-end device — just capped at
  /// [shimmerFramesPerSecond] — so only the explicit accessibility request
  /// switches it off.
  bool get decorativeAnimationEnabled => !reduceMotion;

  /// The shimmer frame-rate ceiling in frames per second, or null when the
  /// display rate is fine.
  int? get shimmerFramesPerSecond =>
      tier.capShimmerFrameRate ? 30 : null;

  /// The equivalent [MotionMode].
  MotionMode get mode =>
      (reduceMotion || tier == DevicePerformanceTier.low)
          ? MotionMode.reduced
          : MotionMode.full;

  @override
  bool operator ==(Object other) =>
      other is MotionPolicy &&
      other.tier == tier &&
      other.reduceMotion == reduceMotion;

  @override
  int get hashCode => Object.hash(tier, reduceMotion);

  @override
  String toString() =>
      'MotionPolicy(tier: ${tier.label}, reduceMotion: $reduceMotion)';
}

/// Owns the app-wide motion policy (issue #709).
///
/// Resolution order:
///
/// 1. The OS accessibility request — `MediaQuery.maybeDisableAnimationsOf`
///    (Android "Remove animations", iOS "Reduce Motion") always wins.
/// 2. The cached [DevicePerformanceTier] — probed once, then persisted by
///    [PerformanceTierCache] and only re-evaluated after a major OS update.
///
/// Widgets read the effective policy through [MotionScope.of].
class PerformanceTierController extends ChangeNotifier {
  PerformanceTierController({
    required PerformanceTierStore store,
    SharedPreferences? preferences,
  })  : _store = store,
        _preferences = preferences;

  final PerformanceTierStore _store;
  SharedPreferences? _preferences;

  DevicePerformanceTier _tier = DevicePerformanceTier.medium;
  MotionMode _motionMode = MotionMode.full;
  bool _osReduceMotion = false;
  bool _resolved = false;

  /// The device performance tier. Defaults to [DevicePerformanceTier.medium]
  /// until [resolve] completes, so first paint is never blocked by I/O.
  DevicePerformanceTier get tier => _tier;

  /// The effective motion policy after tier + accessibility resolution.
  MotionMode get motionMode => _motionMode;

  /// Whether the OS requested reduced motion (accessibility).
  bool get osReduceMotion => _osReduceMotion;

  /// Whether [resolve] has completed at least once.
  bool get isResolved => _resolved;

  /// The resolved policy handed to the widget tree by [MotionScope].
  MotionPolicy get policy => MotionPolicy(
        tier: _tier,
        reduceMotion: _osReduceMotion,
      );

  /// Storage key mirroring the OS reduce-motion preference inside the app so
  /// the controller can honour it before the first frame in tests.
  static const String osReduceMotionKey = 'perf.os_reduce_motion';

  /// Runs tier detection and recomputes [motionMode]. Safe to call more than
  /// once; later calls (e.g. after the OS settings change) merely re-apply.
  Future<void> resolve({
    double? displayRate,
    String? totalMemory,
    bool? osReduceMotion,
  }) async {
    if (osReduceMotion != null) {
      _osReduceMotion = osReduceMotion;
    } else {
      final preferences = await _ensurePreferences();
      _osReduceMotion = preferences.getBool(osReduceMotionKey) ?? false;
    }

    _tier = await _store.resolve(
      displayRate: displayRate,
      totalMemory: totalMemory,
    );

    _resolved = true;
    _recompute();
  }

  /// Applies the live accessibility signal from the widget tree. Called by
  /// [MotionScope] on every build so toggling "Remove animations" in the OS
  /// settings takes effect without an app restart.
  ///
  /// When called during a build (which [MotionScope] does) the recomputed
  /// policy is visible to the current build, but [notifyListeners] is deferred
  /// to the end of the frame — listeners must not be called during build.
  void applyAccessibility({required bool disableAnimations}) {
    if (_osReduceMotion == disableAnimations) return;
    _osReduceMotion = disableAnimations;
    _recompute(deferNotify: true);
  }

  /// Test/override hook: forces a tier (used by debug tooling and tests).
  void debugOverrideTier(DevicePerformanceTier? tier) {
    _tier = tier ?? DevicePerformanceTier.medium;
    _recompute();
  }

  void _recompute({bool deferNotify = false}) {
    final reduced =
        _osReduceMotion || _tier == DevicePerformanceTier.low;
    _motionMode = reduced ? MotionMode.reduced : MotionMode.full;

    final duringBuild = SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks;
    if (deferNotify && duringBuild) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (hasListeners) notifyListeners();
      });
    } else {
      notifyListeners();
    }
  }

  Future<SharedPreferences> _ensurePreferences() async {
    return _preferences ??= await SharedPreferences.getInstance();
  }
}

/// Exposes the resolved [MotionMode] to the widget tree and keeps the
/// controller's accessibility flag in sync with [MediaQuery].
///
/// Place above [MaterialApp] (the router reads it for page transitions) and
/// anywhere a shimmer/hero needs the effective policy:
///
/// ```dart
/// final motion = MotionScope.of(context);
/// if (motion == MotionMode.reduced) return child; // skip the animation
/// ```
class MotionScope extends StatefulWidget {
  const MotionScope({
    super.key,
    required this.controller,
    required this.child,
  });

  final PerformanceTierController controller;
  final Widget child;

  /// The effective motion policy for the nearest [MotionScope].
  static MotionPolicy of(BuildContext context) {
    final policy = maybeOf(context);
    assert(
      policy != null,
      'MotionScope.of() called without a MotionScope ancestor. '
      'Wrap the app (above MaterialApp) in a MotionScope.',
    );
    return policy!;
  }

  /// Like [of], but returns null when no scope is present so leaf widgets can
  /// degrade to their default full-motion behaviour instead of throwing.
  static MotionPolicy? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<_MotionScopeTag>()
        ?.policy;
  }

  @override
  State<MotionScope> createState() => _MotionScopeState();
}

class _MotionScopeState extends State<MotionScope> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant MotionScope oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onControllerChanged);
      widget.controller.addListener(_onControllerChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    // Keep the controller aligned with the live OS accessibility signal
    // (Android "Remove animations" / iOS "Reduce Motion").
    final disableAnimations = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    widget.controller.applyAccessibility(disableAnimations: disableAnimations);

    return _MotionScopeTag(
      policy: widget.controller.policy,
      child: widget.child,
    );
  }
}

class _MotionScopeTag extends InheritedWidget {
  const _MotionScopeTag({required this.policy, required super.child});

  final MotionPolicy policy;

  @override
  bool updateShouldNotify(_MotionScopeTag oldWidget) =>
      oldWidget.policy != policy;
}


