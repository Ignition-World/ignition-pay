import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../core/performance/performance_tier_controller.dart';
import 'app_color_tokens.dart';
import 'motion.dart';

/// A shimmer sweep that adapts to the device performance tier (issue #709).
///
/// * Low-end devices run [CappedFpsShimmer], which repaints the sweep at most
///   30 times per second instead of on every vsync.
/// * Medium/high devices keep the `shimmer` package's `Shimmer.fromColors`
///   exactly as before, so there is no visual regression there.
/// * When the OS asks for reduced motion the shimmer — a purely decorative
///   animation — is skipped and the child renders directly.
///
/// Widgets such as [ShimmerBox] use this loader, so every skeleton in the app
/// inherits the policy without further changes.
class ShimmerLoader extends StatelessWidget {
  const ShimmerLoader({
    super.key,
    required this.child,
    this.enabled = true,
  });

  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;

    // Absent scope (widget previews, unit tests) keeps legacy behaviour.
    final policy = MotionScope.maybeOf(context);
    if (policy != null && !policy.decorativeAnimationEnabled) {
      return child;
    }

    final tokens = context.appColors;
    final cappedFps = policy?.shimmerFramesPerSecond;
    if (cappedFps != null) {
      return CappedFpsShimmer(
        baseColor: tokens.shimmerBase,
        highlightColor: tokens.shimmerHighlight,
        maxFramesPerSecond: cappedFps,
        child: child,
      );
    }

    return Shimmer.fromColors(
      baseColor: tokens.shimmerBase,
      highlightColor: tokens.shimmerHighlight,
      child: child,
    );
  }
}

/// Convenience: a shimmer placeholder box.
class ShimmerBox extends StatelessWidget {
  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 8,
  });

  final double width;
  final double height;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return ShimmerLoader(
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: context.appColors.placeholderSurface,
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}
