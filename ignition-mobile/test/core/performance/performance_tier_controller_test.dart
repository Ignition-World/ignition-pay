import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/performance/device_performance_tier.dart';
import 'package:ignition_mobile/core/performance/performance_tier_cache.dart';
import 'package:ignition_mobile/core/performance/performance_tier_controller.dart';
import 'package:ignition_mobile/core/performance/performance_tier_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeMemoryProbe implements MemoryProbe {
  _FakeMemoryProbe(this.value);

  final String? value;

  @override
  Future<String?> readTotalMemory() async => value;
}

PerformanceTierController buildController({
  required String? memory,
  String osVersion = 'Android 13',
}) {
  final store = PerformanceTierStore(
    service: PerformanceTierService(
      memoryProbe: _FakeMemoryProbe(memory),
      displayRateProbe: null,
    ),
    cache: PerformanceTierCache(),
    currentOsVersion: () => osVersion,
  );
  return PerformanceTierController(store: store);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  group('PerformanceTierController.resolve', () {
    test('a low-end probe yields the reduced motion policy', () async {
      final controller = buildController(memory: '2048000 kB');

      await controller.resolve();

      expect(controller.tier, DevicePerformanceTier.low);
      expect(controller.motionMode, MotionMode.reduced);
      expect(controller.policy.heroesEnabled, isFalse);
      expect(controller.policy.useFadeTransitions, isTrue);
      expect(controller.policy.decorativeAnimationEnabled, isTrue,
          reason: 'low-end keeps a (capped) shimmer, only reduce-motion '
              'removes decorative animation');
      expect(controller.policy.shimmerFramesPerSecond, 30);
      expect(controller.isResolved, isTrue);
    });

    test('a capable device keeps full motion', () async {
      final controller = buildController(memory: '8GB');

      await controller.resolve();

      expect(controller.tier, DevicePerformanceTier.medium);
      expect(controller.motionMode, MotionMode.full);
      expect(controller.policy.heroesEnabled, isTrue);
      expect(controller.policy.useFadeTransitions, isFalse);
      expect(controller.policy.shimmerFramesPerSecond, isNull);
    });

    test('the OS accessibility request wins over a fast device', () async {
      final controller = buildController(memory: '8GB');

      await controller.resolve(osReduceMotion: true);

      expect(controller.tier, DevicePerformanceTier.medium);
      expect(controller.motionMode, MotionMode.reduced);
      expect(controller.policy.skipTransitions, isTrue);
      expect(controller.policy.decorativeAnimationEnabled, isFalse);
      expect(controller.policy.heroesEnabled, isFalse);
    });

    test('the OS request is persisted neither too early nor too late',
        () async {
      final controller = buildController(memory: '8GB');

      await controller.resolve();

      // Nothing stored yet: the OS flag defaults to false.
      expect(controller.osReduceMotion, isFalse);
    });

    test('applyAccessibility recomputes the policy', () async {
      final controller = buildController(memory: '8GB');
      await controller.resolve();

      controller.applyAccessibility(disableAnimations: true);

      expect(controller.policy.reduceMotion, isTrue);
      expect(controller.motionMode, MotionMode.reduced);
    });
  });

  group('MotionPolicy', () {
    test('low tier keeps a capped, non-hero motion profile', () {
      const policy = MotionPolicy(
        tier: DevicePerformanceTier.low,
        reduceMotion: false,
      );

      expect(policy.mode, MotionMode.reduced);
      expect(policy.skipTransitions, isFalse);
      expect(policy.useFadeTransitions, isTrue);
      expect(policy.shimmerFramesPerSecond, 30);
    });

    test('reduce motion removes transitions and decoration entirely', () {
      const policy = MotionPolicy(
        tier: DevicePerformanceTier.high,
        reduceMotion: true,
      );

      expect(policy.mode, MotionMode.reduced);
      expect(policy.skipTransitions, isTrue);
      expect(policy.decorativeAnimationEnabled, isFalse);
      expect(policy.shimmerFramesPerSecond, isNull);
    });

    test('high tier is unaffected', () {
      const policy = MotionPolicy(
        tier: DevicePerformanceTier.high,
        reduceMotion: false,
      );

      expect(policy.mode, MotionMode.full);
      expect(policy.heroesEnabled, isTrue);
      expect(policy.useFadeTransitions, isFalse);
    });
  });

  group('MotionScope', () {
    testWidgets('exposes the controller policy to descendants',
        (tester) async {
      final controller = buildController(memory: '2048000 kB');
      await controller.resolve();

      late MotionPolicy observed;
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: MotionScope(
            controller: controller,
            child: Builder(
              builder: (context) {
                observed = MotionScope.of(context);
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      );

      expect(observed.tier, DevicePerformanceTier.low);
      expect(observed.shimmerFramesPerSecond, 30);
    });

    testWidgets('honours the platform reduce-motion flag', (tester) async {
      final controller = buildController(memory: '8GB');
      await controller.resolve();

      late MotionPolicy observed;
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: MotionScope(
              controller: controller,
              child: Builder(
                builder: (context) {
                  observed = MotionScope.of(context);
                  return const SizedBox.shrink();
                },
              ),
            ),
          ),
        ),
      );

      expect(observed.reduceMotion, isTrue);
      expect(observed.decorativeAnimationEnabled, isFalse);
    });

    testWidgets('maybeOf returns null without a scope', (tester) async {
      MotionPolicy? observed;
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Builder(
            builder: (context) {
              observed = MotionScope.maybeOf(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(observed, isNull);
    });
  });
}
