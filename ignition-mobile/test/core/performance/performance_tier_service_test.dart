import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/performance/device_performance_tier.dart';
import 'package:ignition_mobile/core/performance/performance_tier_cache.dart';
import 'package:ignition_mobile/core/performance/performance_tier_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeMemoryProbe implements MemoryProbe {
  _FakeMemoryProbe(this.value);

  final String? value;
  int reads = 0;

  @override
  Future<String?> readTotalMemory() async {
    reads++;
    return value;
  }
}

class _FakeDisplayRateProbe implements DisplayRateProbe {
  _FakeDisplayRateProbe(this.value);

  final double? value;

  @override
  double? readRefreshRate() => value;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('PerformanceTierService heuristics', () {
    test('classifies a 2GB / 60Hz Android device as low-end', () async {
      final service = PerformanceTierService(
        memoryProbe: _FakeMemoryProbe('2048000 kB'),
        displayRateProbe: _FakeDisplayRateProbe(60),
      );

      final probe = await service.probe();

      expect(probe.tier, DevicePerformanceTier.low);
      expect(probe.reasons['conclusion'], contains('memory'));
    });

    test('classifies a >=3GB / 60Hz device as medium (default motion)',
        () async {
      final service = PerformanceTierService(
        memoryProbe: _FakeMemoryProbe('4096000 kB'),
        displayRateProbe: _FakeDisplayRateProbe(60),
      );

      expect((await service.probe()).tier, DevicePerformanceTier.medium);
    });

    test('a display capped at 45Hz is low-end regardless of memory', () async {
      final service = PerformanceTierService(
        memoryProbe: _FakeMemoryProbe('8GB'),
        displayRateProbe: _FakeDisplayRateProbe(45),
      );

      final probe = await service.probe();

      expect(probe.tier, DevicePerformanceTier.low);
      expect(probe.reasons['conclusion'], contains('refresh rate'));
    });

    test('a 120Hz device with good memory keeps full motion', () async {
      final service = PerformanceTierService(
        memoryProbe: _FakeMemoryProbe('8GB'),
        displayRateProbe: _FakeDisplayRateProbe(120),
      );

      expect((await service.probe()).tier, DevicePerformanceTier.medium);
    });

    test('unavailable signals fall back to medium rather than low-end',
        () async {
      final service = PerformanceTierService(
        memoryProbe: _FakeMemoryProbe(null),
        displayRateProbe: _FakeDisplayRateProbe(null),
      );

      expect((await service.probe()).tier, DevicePerformanceTier.medium);
    });

    test('explicit overrides win over the probes', () async {
      final service = PerformanceTierService(
        memoryProbe: _FakeMemoryProbe('16GB'),
        displayRateProbe: _FakeDisplayRateProbe(120),
      );

      final probe = await service.probe(
        totalMemory: '2048000 kB',
        displayRate: 60,
      );

      expect(probe.tier, DevicePerformanceTier.low);
    });
  });

  group('PerformanceTierService.parseTotalMemoryBytes', () {
    test('parses /proc/meminfo kilobytes', () {
      expect(
        PerformanceTierService.parseTotalMemoryBytes('3986724 kB'),
        3986724 * 1024,
      );
    });

    test('parses GB and MB strings', () {
      expect(
        PerformanceTierService.parseTotalMemoryBytes('8GB'),
        8 * 1024 * 1024 * 1024,
      );
      expect(
        PerformanceTierService.parseTotalMemoryBytes('2048 MB'),
        2048 * 1024 * 1024,
      );
    });

    test('returns null for unparsable values', () {
      expect(PerformanceTierService.parseTotalMemoryBytes(null), isNull);
      expect(PerformanceTierService.parseTotalMemoryBytes('unknown'), isNull);
    });
  });

  group('PerformanceTierCache', () {
    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
    });

    test('returns null when nothing was cached', () async {
      final cache = PerformanceTierCache();

      expect(await cache.read(currentOsVersion: 'Android 14'), isNull);
    });

    test('round-trips the tier for the same OS version', () async {
      final cache = PerformanceTierCache();
      await cache.write(
        DevicePerformanceTier.low,
        currentOsVersion: 'Android 13',
      );

      expect(
        await cache.read(currentOsVersion: 'Android 13'),
        DevicePerformanceTier.low,
      );
    });

    test('a major OS update invalidates the cached tier', () async {
      final cache = PerformanceTierCache();
      await cache.write(
        DevicePerformanceTier.low,
        currentOsVersion: 'Android 13',
      );

      // Android 14 is a major update: re-evaluate exactly once.
      expect(await cache.read(currentOsVersion: 'Android 14'), isNull);
    });

    test('an unknown tier name degrades to medium (schema migration)',
        () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        PerformanceTierCache.tierKey: 'ultra',
        PerformanceTierCache.osVersionKey: 'Android 14',
      });
      final cache = PerformanceTierCache();

      expect(
        await cache.read(currentOsVersion: 'Android 14'),
        DevicePerformanceTier.medium,
      );
    });

    test('clear removes both entries', () async {
      final cache = PerformanceTierCache();
      await cache.write(
        DevicePerformanceTier.low,
        currentOsVersion: 'Android 14',
      );

      await cache.clear();

      expect(await cache.read(currentOsVersion: 'Android 14'), isNull);
    });
  });

  group('PerformanceTierStore', () {
    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
    });

    test('probes only on the first launch and reuses the cache afterwards',
        () async {
      final memory = _FakeMemoryProbe('2048000 kB');
      final store = PerformanceTierStore(
        service: PerformanceTierService(
          memoryProbe: memory,
          displayRateProbe: _FakeDisplayRateProbe(60),
        ),
        cache: PerformanceTierCache(),
        currentOsVersion: () => 'Android 13',
      );

      expect(await store.resolve(), DevicePerformanceTier.low);
      expect(await store.resolve(), DevicePerformanceTier.low);

      expect(memory.reads, 1, reason: 'second resolve must hit the cache');
    });

    test('re-probes after a major OS update', () async {
      final memory = _FakeMemoryProbe('2048000 kB');
      final service = PerformanceTierService(
        memoryProbe: memory,
        displayRateProbe: _FakeDisplayRateProbe(60),
      );
      final cache = PerformanceTierCache();

      final beforeUpdate = PerformanceTierStore(
        service: service,
        cache: cache,
        currentOsVersion: () => 'Android 13',
      );
      await beforeUpdate.resolve();

      final afterUpdate = PerformanceTierStore(
        service: service,
        cache: cache,
        currentOsVersion: () => 'Android 14',
      );
      await afterUpdate.resolve();

      expect(memory.reads, 2);
    });
  });
}
