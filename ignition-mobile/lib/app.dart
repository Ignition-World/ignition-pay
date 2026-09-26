import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/scheduler.dart';

import 'core/design_system/design_system.dart';
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
  @override
  void dispose() {
    unawaited(PushNotificationService().dispose());
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
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle(
            statusBarColor: (isDark ? AppColors.primaryDark : AppColors.primary)
                .withAlpha(230),
            statusBarIconBrightness:
                isDark ? Brightness.light : Brightness.dark,
            statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
            systemNavigationBarColor:
                isDark ? AppColors.surfaceDark : AppColors.surface,
            systemNavigationBarIconBrightness:
                isDark ? Brightness.light : Brightness.dark,
          ),
          child: BiometricGate(
            biometricService: BiometricServices.service,
            child: child ?? const SizedBox.shrink(),
          ),
        );
      },
    );
  }
}
