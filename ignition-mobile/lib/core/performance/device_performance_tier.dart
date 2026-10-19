/// Device performance tiers used to scale motion (issue #709).
///
/// Detection and caching live in [PerformanceTierService]; this file only
/// holds the shared enum plus the per-tier motion policy.
enum DevicePerformanceTier {
  /// Entry-level hardware (e.g. 2GB RAM, low-clocked SoCs). Every non-essential
  /// animation is either removed or heavily simplified.
  low,

  /// Mid-range hardware. Keeps the default Flutter motion.
  medium,

  /// Recent flagships and desktop-class devices. Full motion.
  high,
}

/// Motion policy helpers for [DevicePerformanceTier].
extension DevicePerformanceTierX on DevicePerformanceTier {
  /// Whether this tier runs the full (non-simplified) page transitions.
  bool get useFullPageTransitions => this != DevicePerformanceTier.low;

  /// Whether [Hero] flights are allowed on this tier. Hero flights are
  /// among the most expensive transitions because two large subtrees are
  /// animated simultaneously.
  bool get useHeroAnimations => this != DevicePerformanceTier.low;

  /// Whether the shimmer sweep frame rate must be capped on this tier.
  bool get capShimmerFrameRate => this == DevicePerformanceTier.low;

  /// Human-readable tier name, used in logs and debug banners.
  String get label => switch (this) {
        DevicePerformanceTier.low => 'low',
        DevicePerformanceTier.medium => 'medium',
        DevicePerformanceTier.high => 'high',
      };
}
