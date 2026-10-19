import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

import 'device_performance_tier.dart';
import 'performance_tier_service.dart';

/// Persists the resolved [DevicePerformanceTier] so detection runs once per
/// OS install rather than on every launch (issue #709).
///
/// Cache schema (version 1):
///
/// ```text
/// perf.tier.v1            -> 'low' | 'medium' | 'high'
/// perf.tier.v1.os_version -> OS version string at detection time
/// ```
///
/// A major OS update (different OS version string) invalidates the entry so
/// the heuristics are re-evaluated exactly once after the upgrade, as the
/// acceptance criteria require.
class PerformanceTierCache {
  PerformanceTierCache({SharedPreferences? preferences})
      : _preferences = preferences;

  /// Storage key for the cached tier.
  static const String tierKey = 'perf.tier.v1';

  /// Storage key for the OS version recorded when the tier was detected.
  static const String osVersionKey = 'perf.tier.v1.os_version';

  SharedPreferences? _preferences;

  /// Reads the cached tier, or null when nothing valid is stored.
  ///
  /// Returns null when the stored OS version differs from [currentOsVersion]
  /// (major OS update) or when the stored tier name is unknown (schema
  /// migration), so callers fall back to probing.
  Future<DevicePerformanceTier?> read({required String currentOsVersion}) async {
    final preferences = await _ensurePreferences();
    final raw = preferences.getString(tierKey);
    if (raw == null) return null;

    final storedOsVersion = preferences.getString(osVersionKey);
    if (storedOsVersion != currentOsVersion) {
      // OS changed since detection: re-evaluate exactly once, then re-cache.
      return null;
    }

    return DevicePerformanceTier.values.firstWhere(
      (tier) => tier.name == raw,
      orElse: () => DevicePerformanceTier.medium,
    );
  }

  /// Persists [tier] together with the OS version it was detected on.
  Future<void> write(
    DevicePerformanceTier tier, {
    required String currentOsVersion,
  }) async {
    final preferences = await _ensurePreferences();
    await preferences.setString(tierKey, tier.name);
    await preferences.setString(osVersionKey, currentOsVersion);
  }

  /// Removes the cached entry (used by tests and by a future manual
  /// "re-detect performance" toggle).
  Future<void> clear() async {
    final preferences = await _ensurePreferences();
    await preferences.remove(tierKey);
    await preferences.remove(osVersionKey);
  }

  Future<SharedPreferences> _ensurePreferences() async {
    return _preferences ??= await SharedPreferences.getInstance();
  }
}

/// The current OS version as a cache-invalidation key (issue #709).
///
/// A different value means the OS was upgraded, which is the only event that
/// should force a re-detection. `kIsWeb`/desktop fall back to a constant so
/// the cache never invalidates spuriously there.
String systemOsVersion() {
  if (kIsWeb) return 'web';
  try {
    return Platform.operatingSystemVersion;
  } on Object {
    return 'unknown';
  }
}

/// Wires the real probes and the persistence layer together for `main()`.
PerformanceTierStore createDefaultPerformanceTierStore() {
  return PerformanceTierStore(
    service: PerformanceTierService(),
    cache: PerformanceTierCache(),
    currentOsVersion: systemOsVersion,
  );
}

/// Convenience facade tying probing and caching together.
class PerformanceTierStore {
  PerformanceTierStore({
    required PerformanceTierService service,
    required PerformanceTierCache cache,
    required String Function() currentOsVersion,
  })  : _service = service,
        _cache = cache,
        _currentOsVersion = currentOsVersion;

  final PerformanceTierService _service;
  final PerformanceTierCache _cache;
  final String Function() _currentOsVersion;

  /// Returns the device tier, probing only when the cache misses (first run
  /// or major OS update) and re-caching the result.
  Future<DevicePerformanceTier> resolve({
    double? displayRate,
    String? totalMemory,
  }) async {
    final osVersion = _currentOsVersion();
    final cached = await _cache.read(currentOsVersion: osVersion);
    if (cached != null) return cached;

    final probe = await _service.probe(
      displayRate: displayRate,
      totalMemory: totalMemory,
    );
    await _cache.write(probe.tier, currentOsVersion: osVersion);
    return probe.tier;
  }
}
