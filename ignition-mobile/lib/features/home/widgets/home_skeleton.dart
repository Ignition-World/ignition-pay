import 'package:flutter/material.dart';

import '../../../core/design_system/shimmer_loader.dart';

/// Skeleton placeholder rendered by the Home page while the first load is
/// running, so users never see a blank screen.
///
/// Each block mirrors the dimensions of the widget it stands in for:
/// balance/transaction/notification rows are [ListTile]-height (56) and
/// section headers match the 16px/w600 text line, so swapping in the real
/// dashboard doesn't reflow the page.
///
/// The whole skeleton is wrapped in a [RepaintBoundary] so the shimmer
/// animation repaints only itself and stays smooth.
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  /// Key for locating the skeleton in widget tests.
  static const Key skeletonKey = Key('home-skeleton');

  @override
  Widget build(BuildContext context) {
    return const RepaintBoundary(
      key: skeletonKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: 16),
          // Balance rows — no header, matching the loaded layout.
          _SkeletonRow(titleWidth: 120, trailingWidth: 64),
          _SkeletonRow(titleWidth: 120, trailingWidth: 64),
          _SkeletonRow(titleWidth: 120, trailingWidth: 64),
          SizedBox(height: 16),
          // "Recent transactions" section.
          _SkeletonHeader(width: 148),
          _SkeletonRow(titleWidth: 104, trailingWidth: 56),
          _SkeletonRow(titleWidth: 104, trailingWidth: 56),
          _SkeletonRow(titleWidth: 104, trailingWidth: 56),
          SizedBox(height: 16),
          // "Unread notifications" section.
          _SkeletonHeader(width: 160),
          _SkeletonRow(titleWidth: 132, trailingWidth: 48),
          _SkeletonRow(titleWidth: 132, trailingWidth: 48),
        ],
      ),
    );
  }
}

/// One shimmer row shaped like a [ListTile] with title and trailing text.
class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow({required this.titleWidth, required this.trailingWidth});

  final double titleWidth;
  final double trailingWidth;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56, // ListTile's Material height.
      child: Row(
        children: [
          ShimmerBox(width: titleWidth, height: 16),
          const Spacer(),
          ShimmerBox(width: trailingWidth, height: 16),
        ],
      ),
    );
  }
}

/// Placeholder for a section header line ("Recent transactions", etc.).
class _SkeletonHeader extends StatelessWidget {
  const _SkeletonHeader({required this.width});

  final double width;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: ShimmerBox(width: width, height: 20),
    );
  }
}
