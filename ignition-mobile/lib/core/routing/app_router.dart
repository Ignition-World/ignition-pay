import 'package:go_router/go_router.dart';
import '../../features/home/pages/home_page.dart';

// Route names as constants to avoid hardcoding
class AppRoutes {
  static const home = '/';
  // Add additional routes here as features are added
  // static const settings = '/settings';
  // static const transactionDetails = '/transactions/:id';
}

// GoRouter configuration
final GoRouter appRouter = GoRouter(
  initialLocation: AppRoutes.home,
  routes: [
    GoRoute(
      path: AppRoutes.home,
      builder: (context, state) => const HomePage(),
    ),
    // Add additional routes here
    // GoRoute(
    //   path: AppRoutes.settings,
    //   builder: (context, state) => const SettingsPage(),
    // ),
    // GoRoute(
    //   path: AppRoutes.transactionDetails,
    //   builder: (context, state) {
    //     final transactionId = state.pathParameters['id']!;
    //     return TransactionDetailsPage(transactionId: transactionId);
    //   },
    // ),
  ],
  // Enable deep linking
  debugLogDiagnostics: true,
);