import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/routing/deep_link.dart';
import '../core/security/secure_screen_wrapper.dart';
import '../features/auth/services/biometric_services.dart';
import '../features/home/pages/home_page.dart';
import '../features/send/pages/pending_sends_page.dart';
import '../features/send/payment_review_page.dart';
import '../features/send/services/draft_services.dart';
import '../features/settings/pages/security_settings_page.dart';

/// Maps an inbound `ignitionpay://` / universal-link URI onto an in-app
/// location. Malformed or unsupported links resolve to the home route so the
/// app never strands the user on the router's error page.
String deepLinkLocation(Uri uri) => DeepLinkResolver.locationFor(uri);

final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  debugLogDiagnostics: true, // remove in production
  routes: [
    GoRoute(
      path: '/',
      name: 'home',
      builder: (context, state) => const HomePage(),
    ),
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => Scaffold(
        appBar: AppBar(title: const Text('Sign in')),
        body: const Center(child: Text('Login screen')), // replace with LoginPage()
      ),
    ),
    GoRoute(
      path: '/send',
      name: 'send',
      builder: (context, state) => const SecureScreenWrapper(
        child: Scaffold(
          body: Center(child: Text('Send Screen')), // replace with SendPage()
        ),
      ),
    ),
    GoRoute(
      path: '/receive',
      name: 'receive',
      builder: (context, state) => const SecureScreenWrapper(
        child: Scaffold(
          body: Center(child: Text('Receive Screen')), // replace with ReceivePage()
        ),
      ),
    ),
    // Deep link: ignitionpay://pay/GABCD123?amount=10&asset=USDC
    // or:        https://ignitionpay.com/pay/GABCD123?amount=10&asset=USDC
    // Both schemes are normalised by [DeepLinkResolver] before reaching here.
    GoRoute(
      path: '/pay/:address',
      name: 'pay',
      builder: (context, state) {
        final address = state.pathParameters['address']!;
        final amount = state.uri.queryParameters['amount'];
        final asset = state.uri.queryParameters['asset'] ?? 'XLM';
        final memo = state.uri.queryParameters['memo'];
        return SecureScreenWrapper(
          child: PaymentReviewPage(
            initialAddress: address,
            initialAmount: amount,
            initialAsset: asset,
            initialMemo: memo,
          ),
        );
      },
    ),
    GoRoute(
      path: '/pending-sends',
      name: 'pendingSends',
      builder: (context, state) => PendingSendsPage(
        store: DraftServices.store,
        syncService: DraftServices.syncService,
      ),
    ),
    GoRoute(
      path: '/settings/security',
      name: 'securitySettings',
      builder: (context, state) => SecuritySettingsPage(
        biometricService: BiometricServices.service,
      ),
    ),
    GoRoute(
      path: '/transaction/:id',
      name: 'transaction',
      builder: (context, state) {
        final txId = state.pathParameters['id']!;
        return SecureScreenWrapper(
          child: Scaffold(
            body: Center(child: Text('Transaction: $txId')),
            // replace with: TransactionDetailPage(txId: txId)
          ),
        );
      },
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    appBar: AppBar(title: const Text('Page Not Found')),
    body: Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.link_off, size: 64, color: Color(0xFF616161)),
          const SizedBox(height: 16),
          Text('No route for: ${state.uri}'),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => context.go('/'),
            child: const Text('Go Home'),
          ),
        ],
      ),
    ),
  ),
);