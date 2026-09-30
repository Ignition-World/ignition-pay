import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';
import 'package:ignition_mobile/core/design_system/motion.dart';
import 'package:ignition_mobile/core/design_system/shimmer_loader.dart';
import 'package:ignition_mobile/core/performance/device_performance_tier.dart';
import 'package:ignition_mobile/core/performance/performance_tier_cache.dart';
import 'package:ignition_mobile/core/performance/performance_tier_controller.dart';
import 'package:ignition_mobile/core/performance/performance_tier_service.dart';
import 'package:shimmer/shimmer.dart';

class _NoMemoryProbe implements MemoryProbe {
  @override
  Future<String?> readTotalMemory() async => null;
}

class _NoDisplayRateProbe implements DisplayRateProbe {
  @override
  double? readRefreshRate() => null;
}

/// A store that is never resolved in these tests: the tier is injected through
/// [PerformanceTierController.debugOverrideTier] instead.
PerformanceTierStore unusedStore() => PerformanceTierStore(
      service: PerformanceTierService(
        memoryProbe: _NoMemoryProbe(),
        displayRateProbe: _NoDisplayRateProbe(),
      ),
      cache: PerformanceTierCache(),
      currentOsVersion: () => 'test',
    );

/// Wraps [child] in the real motion wiring: a controller whose tier is
/// injected, plus the platform accessibility flag (which is what the app
/// actually reacts to).
Widget host({
  required MotionPolicy policy,
  required Widget child,
}) {
  final controller = PerformanceTierController(store: unusedStore())
    ..debugOverrideTier(policy.tier);

  return MediaQuery(
    data: MediaQueryData(disableAnimations: policy.reduceMotion),
    child: MotionScope(controller: controller, child: child),
  );
}

void main() {
  group('FrameRateGate', () {
    test('caps a 60Hz stream at 30fps', () {
      final gate = FrameRateGate(maxFramesPerSecond: 30);
      var accepted = 0;

      // 60 frames of a 60Hz display.
      for (var frame = 0; frame < 60; frame++) {
        if (gate.shouldPaint(Duration(microseconds: frame * 16667))) {
          accepted++;
        }
      }

      expect(accepted, inInclusiveRange(29, 32));
    });

    test('lets every frame through at 60fps', () {
      final gate = FrameRateGate(maxFramesPerSecond: 60);
      var accepted = 0;

      for (var frame = 0; frame < 60; frame++) {
        if (gate.shouldPaint(Duration(microseconds: frame * 16667))) {
          accepted++;
        }
      }

      expect(accepted, 60);
    });

    test('paints the first frame immediately', () {
      expect(FrameRateGate().shouldPaint(Duration.zero), isTrue);
    });
  });

  group('AdaptiveMotionPageTransitionsBuilder', () {
    Future<Widget> buildTransition(
      WidgetTester tester,
      DevicePerformanceTier tier, {
      bool reduceMotion = false,
    }) async {
      const child = Text('page');
      late Widget transition;

      await tester.pumpWidget(
        host(
          policy: MotionPolicy(tier: tier, reduceMotion: reduceMotion),
          child: MaterialApp(
            // Linux/Zoom keeps the full-motion fallback deterministic: the
            // Android default (predictive back) needs a route that is
            // installed in a Navigator, which this unit test does not have.
            theme: AppTheme.light().copyWith(platform: TargetPlatform.linux),
            home: Builder(
              builder: (context) {
                final route = MaterialPageRoute<void>(
                  builder: (_) => child,
                );
                transition = const AdaptiveMotionPageTransitionsBuilder()
                    .buildTransitions<void>(
                  route,
                  context,
                  const AlwaysStoppedAnimation<double>(1),
                  const AlwaysStoppedAnimation<double>(0),
                  child,
                );
                return transition;
              },
            ),
          ),
        ),
      );

      return transition;
    }

    testWidgets('low-end devices get a fade instead of a slide',
        (tester) async {
      final transition =
          await buildTransition(tester, DevicePerformanceTier.low);

      expect(transition, isA<FadeTransition>());
    });

    testWidgets('capable devices keep the platform transition',
        (tester) async {
      final transition =
          await buildTransition(tester, DevicePerformanceTier.high);

      // The stock zoom transition, not a bare cross-fade.
      expect(transition, isNot(isA<FadeTransition>()));
      expect(transition, isNotNull);
    });

    testWidgets('reduce-motion removes the transition entirely',
        (tester) async {
      final transition = await buildTransition(
        tester,
        DevicePerformanceTier.high,
        reduceMotion: true,
      );

      expect(transition, isA<Text>());
    });

    testWidgets('AppTheme installs the adaptive builder for every platform',
        (tester) async {
      final theme = AppTheme.light();
      final builders = theme.pageTransitionsTheme.builders;

      expect(builders.keys, containsAll(TargetPlatform.values));
      for (final builder in builders.values) {
        expect(builder, isA<AdaptiveMotionPageTransitionsBuilder>());
      }
    });
  });

  group('ShimmerLoader adapts to the motion policy', () {
    testWidgets('low-end devices use the 30fps capped sweep', (tester) async {
      await tester.pumpWidget(
        host(
          policy: const MotionPolicy(
            tier: DevicePerformanceTier.low,
            reduceMotion: false,
          ),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const ShimmerBox(width: 100, height: 10),
          ),
        ),
      );

      expect(find.byType(CappedFpsShimmer), findsOneWidget);
      expect(find.byType(Shimmer), findsNothing);
    });

    testWidgets('capable devices keep the stock shimmer', (tester) async {
      await tester.pumpWidget(
        host(
          policy: const MotionPolicy(
            tier: DevicePerformanceTier.high,
            reduceMotion: false,
          ),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const ShimmerBox(width: 100, height: 10),
          ),
        ),
      );

      expect(find.byType(Shimmer), findsOneWidget);
      expect(find.byType(CappedFpsShimmer), findsNothing);
    });

    testWidgets('reduce-motion skips the shimmer entirely', (tester) async {
      await tester.pumpWidget(
        host(
          policy: const MotionPolicy(
            tier: DevicePerformanceTier.high,
            reduceMotion: true,
          ),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const ShimmerBox(width: 100, height: 10),
          ),
        ),
      );

      expect(find.byType(Shimmer), findsNothing);
      expect(find.byType(CappedFpsShimmer), findsNothing);
      expect(find.byType(ShaderMask), findsNothing);
    });

    testWidgets('without a scope the legacy shimmer is preserved',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: const ShimmerBox(width: 100, height: 10),
        ),
      );

      expect(find.byType(Shimmer), findsOneWidget);
    });
  });

  group('CappedFpsShimmer', () {
    testWidgets('renders a shader mask and animates within the cap',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: const CappedFpsShimmer(
            baseColor: Color(0xFFE0E0E0),
            highlightColor: Color(0xFFF5F5F5),
            child: SizedBox(width: 100, height: 10),
          ),
        ),
      );

      expect(find.byType(ShaderMask), findsOneWidget);

      // Ten frames at ~16ms: the gate accepts roughly every other frame.
      // The widget must keep building without throwing.
      for (var frame = 0; frame < 10; frame++) {
        await tester.pump(const Duration(milliseconds: 16));
      }

      expect(find.byType(ShaderMask), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
