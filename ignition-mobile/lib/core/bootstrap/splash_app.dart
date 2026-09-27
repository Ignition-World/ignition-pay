import 'package:flutter/material.dart';

import 'package:ignition_mobile/core/design_system/design_system.dart';

/// The screen shown while the app finishes starting up (#684).
///
/// Rendered by `runApp` before any plugin, asset or network work begins, so
/// the first frame the user sees is never blocked by `.env`, Firebase, Sentry
/// or analytics.
class SplashApp extends StatelessWidget {
  const SplashApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ignition Pay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: const SplashPage(),
    );
  }
}

/// Branded loading screen. Replace with `IgnitionPayApp` once the critical
/// start-up path completes.
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      key: const Key('splash'),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                Icons.account_balance_wallet,
                color: Colors.white,
                size: 44,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Ignition Pay',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 24),
            const SplashProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

/// Small indeterminate progress indicator shown under the wordmark.
class SplashProgressIndicator extends StatelessWidget {
  const SplashProgressIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      key: Key('splash_loading'),
      width: 24,
      height: 24,
      child: CircularProgressIndicator(strokeWidth: 2),
    );
  }
}
