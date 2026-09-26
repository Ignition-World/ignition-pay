import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/navigation/app_shell.dart';
import '../core/routing/deep_link.dart';
import '../core/security/secure_screen_wrapper.dart';
import '../features/activity/pages/activity_page.dart';
import '../features/auth/services/biometric_services.dart';
import '../features/home/pages/home_page.dart';
import '../features/send/pages/pending_sends_page.dart';
import '../features/send/payment_review_page.dart';
import '../features/send/services/draft_services.dart';
import '../features/settings/pages/security_settings_page.dart';
import '../features/settings/pages/settings_page.dart';

/// Maps an inbound `ignitionpay://` / universal-link URI onto an in-app
/// location. Malformed or unsupported links resolve to the home route so the
/// app never strands the user on the router's error page.
String deepLinkLocation(Uri uri) => DeepLinkResolver.locationFor(uri);

/// Routes rendered without the navigation shell — the sign-in screen is the
/// only one, because a bottom bar on a logged-out screen is noise.
List<RouteBase> defaultTopLevelRoutes() => <RouteBase>[
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => Scaffold(
          appBar: AppBar(title: const Text('Sign in')),
          body: const Center(child: Text('Login screen')), // replace with LoginPage()
        ),
      ),
    ];

/// The five navigation sections, each as an independent branch with its own
/// navigation stack (#690).
///
/// Which route lives in which branch decides where a deep link lands:
///
/// | Location                | Section  |
/// |-------------------------|----------|
/// | `/`, `/transaction/:id` | Home     |
/// | `/send`, `/review`, `/pending-sends` | Send |
/// | `/receive`, `/pay/:address` | Receive |
/// | `/activity`             | Activity  |
/// | `/settings`, `/settings/security` | Settings |
List<StatefulShellBranch> defaultShellBranches() => <StatefulShellBranch>[
      StatefulShellBranch(
        routes: <RouteBase>[
          GoRoute(
            path: '/',
            name: 'home',
            builder: (context, state) => const HomePage(),
            routes: <RouteBase>[
              GoRoute(
                path: 'transaction/:id',
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
          ),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          GoRoute(
            path: '/send',
            name: 'send',
            builder: (context, state) => const SecureScreenWrapper(
              child: Scaffold(
                body: Center(child: Text('Send Screen')), // replace with SendPage()
              ),
            ),
            routes: <RouteBase>[
              GoRoute(
                path: 'review',
                name: 'review',
                builder: (context, state) => PaymentReviewPage(
                  initialAddress: state.uri.queryParameters['to'] ?? '',
                  initialAmount: state.uri.queryParameters['amount'] ?? '',
                  initialAsset: state.uri.queryParameters['asset'] ?? 'XLM',
                  initialMemo: state.uri.queryParameters['memo'],
                ),
              ),
              GoRoute(
                path: 'pending-sends',
                name: 'pendingSends',
                builder: (context, state) => PendingSendsPage(
                  store: DraftServices.store,
                  syncService: DraftServices.syncService,
                ),
              ),
            ],
          ),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          GoRoute(
            path: '/receive',
            name: 'receive',
            builder: (context, state) => const SecureScreenWrapper(
              child: Scaffold(
                body: Center(child: Text('Receive Screen')), // replace with ReceivePage()
              ),
            ),
            routes: <RouteBase>[
              // Deep link: ignitionpay://pay/GABCD123?amount=10&asset=USDC
              // or:        https://ignitionpay.com/pay/GABCD123?amount=10&asset=USDC
              // Both schemes are normalised by [DeepLinkResolver] before
              // reaching here.
              GoRoute(
                path: 'pay/:address',
                name: 'pay',
                builder: (context, state) {
                  final address = state.pathParameters['address']!;
                  final amount = state.uri.queryParameters['amount'];
                  final asset = state.uri.queryParameters['asset'] ?? 'XLM';
                  final memo = state.uri.queryParameters['memo'];
                  return SecureScreenWrapper(
                    child: PaymentReviewPage(
                      initialAddress: address,
                      initialAmount: amount ?? '',
                      initialAsset: asset,
                      initialMemo: memo,
                    ),
                  );
                },
              ),
            ],
          ),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          GoRoute(
            path: '/activity',
            name: 'activity',
            builder: (context, state) => const ActivityPage(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          GoRoute(
            path: '/settings',
            name: 'settings',
            builder: (context, state) => const SettingsPage(),
            routes: <RouteBase>[
              GoRoute(
                path: 'security',
                name: 'securitySettings',
                builder: (context, state) => SecuritySettingsPage(
                  biometricService: BiometricServices.service,
                ),
              ),
            ],
          ),
        ],
      ),
    ];

/// Builds the app router.
///
/// [branches] and [topLevelRoutes] are parameters so tests can exercise the
/// shell with placeholder pages instead of the real screens, which need
/// plugins (biometrics, draft store) that a widget test cannot provide.
GoRouter createAppRouter({
  List<StatefulShellBranch>? branches,
  List<RouteBase>? topLevelRoutes,
  String initialLocation = '/',
}) {
  return GoRouter(
    initialLocation: initialLocation,
    debugLogDiagnostics: kDebugMode,
    routes: <RouteBase>[
      ...(topLevelRoutes ?? defaultTopLevelRoutes()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: branches ?? defaultShellBranches(),
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
}

/// The router the app runs with.
final GoRouter appRouter = createAppRouter();
