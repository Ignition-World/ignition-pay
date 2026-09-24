import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'core/design_system/design_system.dart';
import 'core/routing/app_router.dart';

class IgnitionPayApp extends StatelessWidget {
  const IgnitionPayApp({super.key});

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
    );
  }
}
