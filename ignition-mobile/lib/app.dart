import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/scheduler.dart';

import 'core/design_system/design_system.dart';
import 'core/performance/performance_tier_cache.dart';
import 'core/performance/performance_tier_controller.dart';
import 'core/push_notification_service.dart';
import 'features/auth/services/biometric_services.dart';
import 'features/auth/widgets/biometric_gate.dart';
import 'router/app_router.dart';

class IgnitionPayApp extends StatefulWidget {
  const IgnitionPayApp({super.key});

  @override
  State<IgnitionPayApp> createState() => _IgnitionPayAppState();
}

class _IgnitionPayAppState extends State<IgnitionPayApp> {
  /// Resolves the device performance tier once, then caches it.
  ///
  /// Resolution is deliberately not awaited before the first frame: the app
  /// must paint immediately. Until it completes the policy stays at the
  /// conservative default (full motion), and the scope swaps in the capped
  /// policy as soon as the SharedPreferences read returns.
  late final PerformanceTierController _motion = PerformanceTierController(
    store: createDefaultPerformanceTierStore(),
  );

  @override
  void initState() {
    super.initState();
    unawaited(_motion.resolve());
  }

  @override
  void dispose() {
    unawaited(PushNotificationService().dispose());
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Kick off Inter preload after the first frame so font I/O never blocks
    // first paint. Until then TextTheme uses the documented system fallbacks.
    SchedulerBinding.instance.addPostFrameCallback((_) {
      // Fire-and-forget; failures leave explicit fontFamilyFallback in place.
      AppTheme.preloadFonts();
    });

    return MaterialApp.router(
      title: 'Ignition Pay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
      builder: (context, child) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        return MotionScope(
          controller: _motion,
          child: Builder(
            builder: (context) {
              // Reads the policy from the scope (below). HeroMode wraps the
              // whole navigator so hero flights are disabled on low-end
              // devices and under OS reduce-motion (issue #709).
              final policy = MotionScope.of(context);
              return HeroMode(
                enabled: policy.heroesEnabled,
                child: AnnotatedRegion<SystemUiOverlayStyle>(
                  value: SystemUiOverlayStyle(
                    statusBarColor:
                        (isDark ? AppColors.primaryDark : AppColors.primary)
                            .withAlpha(230),
                    statusBarIconBrightness:
                        isDark ? Brightness.light : Brightness.dark,
                    statusBarBrightness:
                        isDark ? Brightness.dark : Brightness.light,
                    systemNavigationBarColor:
                        isDark ? AppColors.surfaceDark : AppColors.surface,
                    systemNavigationBarIconBrightness:
                        isDark ? Brightness.light : Brightness.dark,
                  ),
                  child: BiometricGate(
                    biometricService: BiometricServices.service,
                    child: child ?? const SizedBox.shrink(),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }
}
