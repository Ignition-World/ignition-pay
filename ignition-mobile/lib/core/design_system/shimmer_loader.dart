import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import 'app_color_tokens.dart';

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
    final tokens = context.appColors;
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
