import 'dart:io';

import 'package:flutter/widgets.dart';

import 'device_performance_tier.dart';

/// Result of the performance-tier heuristics.
class PerformanceProbe {
  const PerformanceProbe({required this.tier, required this.reasons});

  /// The tier the heuristics concluded.
  final DevicePerformanceTier tier;

  /// Raw measurements the conclusion was derived from, kept for logging so the
  /// numbers behind a tier decision can be inspected in the field.
  final Map<String, Object> reasons;

  @override
  String toString() =>
      'PerformanceProbe(tier: ${tier.label}, reasons: $reasons)';
}

/// Reads the total physical memory of the current device.
abstract class MemoryProbe {
  /// Returns a platform-specific total-memory string (`3986724 kB`,
  /// `6GB`, …) or null when the platform does not expose one.
  Future<String?> readTotalMemory();
}

/// Default [MemoryProbe] backed by `/proc/meminfo` (Android and Linux).
///
/// This avoids pulling in a platform-channel dependency just to size a
/// cache. iOS does not expose total RAM through `/proc`, so the probe returns
/// null there and the heuristics fall back to the display-rate signal.
class ProcMemoryProbe implements MemoryProbe {
  const ProcMemoryProbe();

  @override
  Future<String?> readTotalMemory() async {
    try {
      if (!Platform.isAndroid && !Platform.isLinux) return null;
      final lines = await File('/proc/meminfo').readAsLines();
      for (final line in lines) {
        if (line.startsWith('MemTotal:')) {
          return line.substring('MemTotal:'.length).trim();
        }
      }
      return null;
    } on Object {
      // Sandboxed platforms can deny /proc access; treat as unknown.
      return null;
    }
  }
}

/// Reads the primary display's maximum refresh rate.
abstract class DisplayRateProbe {
  /// Refresh rate in Hz, or null when unavailable.
  double? readRefreshRate();
}

/// Default [DisplayRateProbe] backed by [FlutterView.display].
class FlutterViewDisplayRateProbe implements DisplayRateProbe {
  const FlutterViewDisplayRateProbe();

  @override
  double? readRefreshRate() {
    try {
      final views = WidgetsBinding.instance.platformDispatcher.views;
      if (views.isEmpty) return null;
      return views.first.display.refreshRate;
    } on Object {
      return null;
    }
  }
}

/// Resolves the [DevicePerformanceTier] of the current device (issue #709).
///
/// The heuristics deliberately use only signals available without a new
/// platform dependency, so the same code runs on Android, iOS and desktop:
///
///  1. **Display refresh rate** — a panel capped at or below 45Hz cannot
///     render 60fps no matter how fast the SoC is, so it is treated as
///     low-end.
///  2. **Total memory** (Android/Linux via `/proc/meminfo`) — entry-level
///     phones (Samsung A0x class, Redmi 9A class) ship with 2–3GB.
///
/// When neither signal is conclusive the device is treated as
/// [DevicePerformanceTier.medium], which keeps the default Flutter motion.
/// Being wrong toward `medium` is safe: no functionality is removed, only the
/// cheapest transitions are used when the evidence is clear.
class PerformanceTierService {
  PerformanceTierService({
    MemoryProbe? memoryProbe,
    DisplayRateProbe? displayRateProbe,
  })  : _memoryProbe = memoryProbe ?? const ProcMemoryProbe(),
        _displayRateProbe =
            displayRateProbe ?? const FlutterViewDisplayRateProbe();

  final MemoryProbe _memoryProbe;
  final DisplayRateProbe _displayRateProbe;

  /// Total memory below which a device is treated as low-end. Entry-level
  /// Android devices ship with 2–3GB.
  static const int lowEndMemoryCeilingBytes = 3 * 1024 * 1024 * 1024;

  /// Displays capped at or below this refresh rate cannot render 60fps.
  static const int lowEndDisplayRateCeiling = 45;

  /// Runs the heuristics. Overrides exist for tests and future analytics
  /// experiments.
  Future<PerformanceProbe> probe({
    double? displayRate,
    String? totalMemory,
  }) async {
    final effectiveDisplayRate = displayRate ?? _displayRateProbe.readRefreshRate();
    final effectiveMemory = totalMemory ?? await _memoryProbe.readTotalMemory();

    final reasons = <String, Object>{
      'displayRate': effectiveDisplayRate ?? 'unknown',
      'totalMemory': effectiveMemory ?? 'unknown',
    };

    if (effectiveDisplayRate != null &&
        effectiveDisplayRate > 0 &&
        effectiveDisplayRate <= lowEndDisplayRateCeiling) {
      reasons['conclusion'] = 'refresh rate <= $lowEndDisplayRateCeiling Hz';
      return PerformanceProbe(
        tier: DevicePerformanceTier.low,
        reasons: reasons,
      );
    }

    final memoryBytes = parseTotalMemoryBytes(effectiveMemory);
    if (memoryBytes != null && memoryBytes < lowEndMemoryCeilingBytes) {
      reasons['conclusion'] =
          'total memory < ${lowEndMemoryCeilingBytes ~/ (1024 * 1024 * 1024)}GB';
      return PerformanceProbe(
        tier: DevicePerformanceTier.low,
        reasons: reasons,
      );
    }

    reasons['conclusion'] = 'no low-end signal';
    return PerformanceProbe(
      tier: DevicePerformanceTier.medium,
      reasons: reasons,
    );
  }

  /// Parses `/proc/meminfo`-style strings (`3986724 kB`, `8GB`, `2048MB`) into
  /// bytes. Returns null when the value cannot be understood.
  static int? parseTotalMemoryBytes(String? totalMemory) {
    if (totalMemory == null) return null;
    final match = RegExp(
      r'(\d+(?:\.\d+)?)\s*(gb|mb|kb|b)?\b',
      caseSensitive: false,
    ).firstMatch(totalMemory);
    if (match == null) return null;

    final value = double.tryParse(match.group(1)!);
    if (value == null) return null;

    final unit = (match.group(2) ?? 'kb').toLowerCase();
    return switch (unit) {
      'gb' => (value * 1024 * 1024 * 1024).round(),
      'mb' => (value * 1024 * 1024).round(),
      'kb' => (value * 1024).round(),
      _ => value.round(),
    };
  }
}
