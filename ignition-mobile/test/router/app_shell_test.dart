import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ignition_mobile/core/navigation/app_shell.dart';
import 'package:ignition_mobile/router/app_router.dart';

/// Placeholder page so the shell can be tested without the real screens,
/// which need plugins a widget test cannot provide.
class _Stub extends StatelessWidget {
  const _Stub(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(label)));
}

GoRoute _branchRoot(
  String path,
  String name,
  String label, {
  List<RouteBase> children = const <RouteBase>[],
}) {
  return GoRoute(
    path: path,
    name: name,
    builder: (context, state) => _Stub(label),
    routes: children,
  );
}

/// The production branch layout, with placeholder pages.
GoRouter _testRouter() {
  return createAppRouter(
    branches: <StatefulShellBranch>[
      StatefulShellBranch(
        routes: <RouteBase>[
          _branchRoot('/', 'home', 'Home', children: <RouteBase>[
            GoRoute(
              path: 'detail/:id',
              name: 'detail',
              builder: (context, state) =>
                  _Stub('Detail ${state.pathParameters['id']}'),
            ),
          ]),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          _branchRoot('/send', 'send', 'Send', children: <RouteBase>[
            GoRoute(
              path: 'confirm',
              name: 'confirm',
              builder: (context, state) => const _Stub('Confirm'),
            ),
          ]),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          _branchRoot('/receive', 'receive', 'Receive'),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          _branchRoot('/activity', 'activity', 'Activity'),
        ],
      ),
      StatefulShellBranch(
        routes: <RouteBase>[
          _branchRoot('/settings', 'settings', 'Settings', children: <RouteBase>[
            GoRoute(
              path: 'security',
              name: 'security',
              builder: (context, state) => const _Stub('Security'),
            ),
          ]),
        ],
      ),
    ],
    topLevelRoutes: <RouteBase>[
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const _Stub('Login'),
      ),
    ],
  );
}

void main() {
  late GoRouter router;

  setUp(() {
    router = _testRouter();
  });

  tearDown(() => router.dispose());

  Future<void> pumpShell(WidgetTester tester, {String? location}) async {
    if (location != null) {
      router.go(location);
    }
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
  }

  /// Simulates the Android back gesture.
  Future<void> pressSystemBack(WidgetTester tester) async {
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
  }

  Future<void> tapDestination(WidgetTester tester, AppSection section) async {
    await tester.tap(find.byKey(Key('nav_destination_${section.name}')));
    await tester.pumpAndSettle();
  }

  group('navigation bar', () {
    testWidgets('renders the five sections with a visible label each',
        (tester) async {
      await pumpShell(tester);

      expect(find.byKey(const Key('app_bottom_nav')), findsOneWidget);
      for (final section in AppSection.values) {
        expect(
          find.byKey(Key('nav_destination_${section.name}')),
          findsOneWidget,
          reason: '${section.label} destination',
        );
        expect(find.text(section.label), findsWidgets);
      }
    });

    testWidgets('every destination carries an accessible name', (tester) async {
      await pumpShell(tester);

      // Each icon is wrapped in a semantics node named after its section and
      // repeats that name as the visible label and the tooltip, so TalkBack and
      // VoiceOver announce the destination rather than "button".
      for (final section in AppSection.values) {
        final destination =
            find.byKey(Key('nav_destination_${section.name}'));
        expect(destination, findsOneWidget, reason: section.name);

        final semantics = find
            .ancestor(of: destination, matching: find.byType(Semantics))
            .first;
        expect(tester.widget<Semantics>(semantics).properties.label,
            section.label);

        final widget = tester.widget<NavigationDestination>(destination);
        expect(widget.label, section.label);
        expect(widget.tooltip, section.label);
      }
    });

    testWidgets('stays visible on every tab', (tester) async {
      await pumpShell(tester);

      for (final section in AppSection.values) {
        await tapDestination(tester, section);
        expect(find.byKey(const Key('app_bottom_nav')), findsOneWidget);
      }
    });
  });

  group('switching sections', () {
    testWidgets('starts on Home', (tester) async {
      await pumpShell(tester);

      expect(find.text('Home'), findsWidgets);
    });

    testWidgets('tapping a destination switches to that section',
        (tester) async {
      await pumpShell(tester);

      await tapDestination(tester, AppSection.activity);

      expect(find.text('Activity'), findsWidgets);
    });

    testWidgets('tapping the current section returns it to its root',
        (tester) async {
      await pumpShell(tester);
      await tapDestination(tester, AppSection.home);
      router.go('/detail/42');
      await tester.pumpAndSettle();
      expect(find.text('Detail 42'), findsOneWidget);

      await tapDestination(tester, AppSection.home);

      expect(find.text('Home'), findsWidgets);
      expect(find.text('Detail 42'), findsNothing);
    });
  });

  group('per-section navigation stacks', () {
    testWidgets('each section keeps its own stack', (tester) async {
      await pumpShell(tester);

      router.go('/detail/7');
      await tester.pumpAndSettle();
      router.go('/send/confirm');
      await tester.pumpAndSettle();

      await tapDestination(tester, AppSection.activity);
      expect(find.text('Activity'), findsWidgets);

      await tapDestination(tester, AppSection.home);
      expect(find.text('Detail 7'), findsOneWidget);

      await tapDestination(tester, AppSection.send);
      expect(find.text('Confirm'), findsOneWidget);
    });

    testWidgets('a deep link opens the right section and stack',
        (tester) async {
      await pumpShell(tester);

      router.go('/settings/security');
      await tester.pumpAndSettle();

      expect(find.text('Security'), findsOneWidget);
      // The Settings branch is selected, and Home is not.
      expect(find.text('Settings'), findsWidgets);
    });
  });

  group('system back', () {
    testWidgets('unwinds the current section instead of closing the app',
        (tester) async {
      await pumpShell(tester);
      router.go('/detail/7');
      await tester.pumpAndSettle();

      await pressSystemBack(tester);

      expect(find.text('Home'), findsWidgets);
      expect(find.text('Detail 7'), findsNothing);
    });

    testWidgets('on a secondary section returns to Home', (tester) async {
      await pumpShell(tester);
      await tapDestination(tester, AppSection.settings);

      await pressSystemBack(tester);

      expect(find.text('Home'), findsWidgets);
      expect(find.text('Settings'), findsWidgets); // the bar label
    });

    testWidgets('unwinds a nested route in a secondary section', (tester) async {
      await pumpShell(tester);
      await tapDestination(tester, AppSection.send);
      router.go('/send/confirm');
      await tester.pumpAndSettle();
      expect(find.text('Confirm'), findsOneWidget);

      await pressSystemBack(tester);

      expect(find.text('Send'), findsWidgets);
      expect(find.text('Confirm'), findsNothing);
    });
  });

  group('routes outside the shell', () {
    testWidgets('the sign-in screen has no navigation bar', (tester) async {
      await pumpShell(tester, location: '/login');

      expect(find.text('Login'), findsOneWidget);
      expect(find.byKey(const Key('app_bottom_nav')), findsNothing);
    });
  });
}
