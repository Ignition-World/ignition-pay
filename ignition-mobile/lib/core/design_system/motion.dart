import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../performance/performance_tier_controller.dart';

/// Page transitions that adapt to the device (issue #709).
///
/// Registered for every platform in [AppTheme]. Behaviour:
///
///  * OS reduce-motion is on → no transition at all. The user asked for less
///    motion and this is a wallet: getting to the content instantly is the
///    accessible behaviour, not a 300ms cross-fade.
///  * Low-end device or medium tier on a constrained display → a single
///    opacity cross-fade, which avoids the layout/paint work of the platform
///    slide/zoom (no translation, no snapshot, no depth transform).
///  * Anything else → the Flutter default builder for the platform, so
///    high-end devices are pixel-identical to a stock Material app.
///
/// The policy is read from [MotionScope] at transition time rather than baked
/// into the theme, so a late-resolving tier still applies to the next
/// navigation without rebuilding the whole [MaterialApp].
class AdaptiveMotionPageTransitionsBuilder extends PageTransitionsBuilder {
  const AdaptiveMotionPageTransitionsBuilder();

  /// Duration of the simplified cross-fade. Shorter than the platform default
  /// (300–450ms) because a fade has less visual work to communicate.
  static const Duration fadeDuration = Duration(milliseconds: 200);

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final policy = MotionScope.maybeOf(context);

    if (policy != null && policy.skipTransitions) {
      // Accessibility: the OS asked for animations to be removed.
      return child;
    }

    if (policy != null && policy.useFadeTransitions) {
      return FadeTransition(
        opacity: CurvedAnimation(
          parent: animation,
          curve: Curves.easeOut,
          reverseCurve: Curves.easeIn,
        ),
        child: child,
      );
    }

    // Full motion: delegate to the stock builder for this platform. Falling
    // back through [PageTransitionsTheme]'s defaults keeps high-end devices
    // on the exact transitions Flutter ships.
    final platform = Theme.of(context).platform;
    final fallback = const PageTransitionsTheme().builders[platform] ??
        const ZoomPageTransitionsBuilder();
    return fallback.buildTransitions<T>(
      route,
      context,
      animation,
      secondaryAnimation,
      child,
    );
  }
}

/// Builds the app-wide [PageTransitionsTheme] used by [AppTheme].
///
/// Every platform maps to [AdaptiveMotionPageTransitionsBuilder], which
/// delegates back to Flutter's per-platform default when the device can
/// afford full motion.
PageTransitionsTheme adaptivePageTransitionsTheme() {
  return PageTransitionsTheme(
    builders: <TargetPlatform, PageTransitionsBuilder>{
      for (final platform in TargetPlatform.values)
        platform: const AdaptiveMotionPageTransitionsBuilder(),
    },
  );
}

/// Time-based gate that accepts at most N frames per second.
///
/// Extracted so the shimmer frame-rate cap can be unit tested without
/// pumping widgets.
class FrameRateGate {
  FrameRateGate({this.maxFramesPerSecond = 30})
      : assert(maxFramesPerSecond > 0);

  /// Upper bound on accepted frames per second.
  final int maxFramesPerSecond;

  Duration _lastAccepted = Duration.zero;
  bool _started = false;

  /// Minimum gap between accepted frames.
  Duration get interval =>
      Duration(microseconds: (1000000 / maxFramesPerSecond).round());

  /// Returns true when a frame arriving at [elapsed] may be painted.
  bool shouldPaint(Duration elapsed) {
    if (!_started) {
      _started = true;
      _lastAccepted = elapsed;
      return true;
    }
    if (elapsed - _lastAccepted < interval) return false;
    _lastAccepted = elapsed;
    return true;
  }

  /// Drops the accumulator so the next frame is always painted.
  void reset() {
    _started = false;
    _lastAccepted = Duration.zero;
  }
}

/// Shimmer sweep capped at a maximum frame rate (issue #709).
///
/// The stock `shimmer` package drives its gradient with an
/// [AnimationController] that repaints on every vsync. On entry-level devices
/// that repaint is one of the most visible sources of jank while lists load,
/// so this implementation runs the same visual sweep but only rebuilds the
/// mask when [FrameRateGate] allows it (~30fps on a 60Hz panel).
class CappedFpsShimmer extends StatefulWidget {
  const CappedFpsShimmer({
    super.key,
    required this.child,
    required this.baseColor,
    required this.highlightColor,
    this.period = const Duration(milliseconds: 1500),
    this.maxFramesPerSecond = 30,
  });

  final Widget child;
  final Color baseColor;
  final Color highlightColor;

  /// Duration of one full sweep across the child.
  final Duration period;

  /// Frame-rate ceiling for the sweep.
  final int maxFramesPerSecond;

  /// Color stops copied from the `shimmer` package so the capped sweep is
  /// visually interchangeable with `Shimmer.fromColors`.
  static const List<double> gradientStops = <double>[0.0, 0.35, 0.5, 0.65, 1.0];

  @override
  State<CappedFpsShimmer> createState() => _CappedFpsShimmerState();
}

class _CappedFpsShimmerState extends State<CappedFpsShimmer>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  late final FrameRateGate _gate =
      FrameRateGate(maxFramesPerSecond: widget.maxFramesPerSecond);
  double _progress = 0;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void _onTick(Duration elapsed) {
    if (!_gate.shouldPaint(elapsed)) return;

    final periodMicros = widget.period.inMicroseconds;
    setState(() {
      _progress = (elapsed.inMicroseconds % periodMicros) / periodMicros;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = <Color>[
      widget.baseColor,
      widget.baseColor,
      widget.highlightColor,
      widget.baseColor,
      widget.baseColor,
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite && constraints.maxWidth > 0
            ? constraints.maxWidth
            : 240.0;
        // Sweep the highlight from just off the left edge to just off the
        // right edge, mirroring the shimmer package's ltr direction.
        final dx = -width + (2 * width * _progress);

        return ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (bounds) => LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.centerRight,
            colors: colors,
            stops: CappedFpsShimmer.gradientStops,
            transform: _SlideGradientTransform(dx),
          ).createShader(bounds),
          child: widget.child,
        );
      },
    );
  }
}

/// Translates a gradient horizontally, producing the sweep.
class _SlideGradientTransform extends GradientTransform {
  const _SlideGradientTransform(this.slide);

  final double slide;

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) {
    return Matrix4.translationValues(slide, 0, 0);
  }
}
