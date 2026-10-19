import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/routing/route_restoration_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('isRestorable', () {
    test('accepts the app routes', () {
      for (final location in <String>[
        '/',
        '/send',
        '/receive',
        '/history',
        '/settings',
        '/notifications',
        '/pay/GABCD?amount=10',
        '/transaction/abc',
      ]) {
        expect(
          RouteRestorationService.isRestorable(location),
          isTrue,
          reason: location,
        );
      }
    });

    test('rejects the sign-in route and junk', () {
      for (final location in <String>[
        '/login',
        '',
        'send',
        '/unknown-route',
        '/settings-evil',
        '/send-evil',
        '/../etc/passwd',
        '/send/${'x' * 3000}',
      ]) {
        expect(
          RouteRestorationService.isRestorable(location),
          isFalse,
          reason: location,
        );
      }
    });
  });

  group('requiresAuth', () {
    test('wallet screens need a session', () {
      expect(RouteRestorationService.requiresAuth('/send'), isTrue);
      expect(RouteRestorationService.requiresAuth('/receive'), isTrue);
      expect(RouteRestorationService.requiresAuth('/history'), isTrue);
      expect(RouteRestorationService.requiresAuth('/pay/GABC'), isTrue);
      expect(
        RouteRestorationService.requiresAuth('/settings/security'),
        isTrue,
      );
    });

    test('home and plain settings do not', () {
      expect(RouteRestorationService.requiresAuth('/'), isFalse);
      expect(RouteRestorationService.requiresAuth('/settings'), isFalse);
    });
  });

  group('resolveInitialLocation', () {
    test('nothing saved means nothing to restore', () {
      expect(
        RouteRestorationService.resolveInitialLocation(
          saved: null,
          isAuthenticated: true,
        ),
        isNull,
      );
    });

    test('a non-restorable location is discarded', () {
      expect(
        RouteRestorationService.resolveInitialLocation(
          saved: '/definitely-not-a-route',
          isAuthenticated: true,
        ),
        isNull,
      );
    });

    test('a public route is restored for a signed-in user', () {
      expect(
        RouteRestorationService.resolveInitialLocation(
          saved: '/receive',
          isAuthenticated: true,
        ),
        '/receive',
      );
    });

    test('an auth-required route redirects a signed-out user', () {
      expect(
        RouteRestorationService.resolveInitialLocation(
          saved: '/send',
          isAuthenticated: false,
        ),
        RouteRestorationService.authRedirectLocation,
      );
    });

    test('query parameters survive the resolution', () {
      expect(
        RouteRestorationService.resolveInitialLocation(
          saved: '/pay/GABC?amount=10&asset=USDC',
          isAuthenticated: true,
        ),
        '/pay/GABC?amount=10&asset=USDC',
      );
    });
  });

  group('migrate', () {
    test('upgrades a legacy version-less payload', () {
      final migrated =
          RouteRestorationService.migrate(<String, Object?>{'route': '/send'});

      expect(migrated, isNotNull);
      expect(migrated!['v'], RouteRestorationService.schemaVersion);
      expect(migrated['location'], '/send');
    });

    test('passes the current schema through', () {
      final migrated = RouteRestorationService.migrate(<String, Object?>{
        'v': RouteRestorationService.schemaVersion,
        'location': '/history',
      });

      expect(migrated!['location'], '/history');
    });

    test('discards payloads from a newer schema', () {
      expect(
        RouteRestorationService.migrate(<String, Object?>{
          'v': RouteRestorationService.schemaVersion + 1,
          'location': '/send',
        }),
        isNull,
      );
    });

    test('discards payloads without a location', () {
      expect(
        RouteRestorationService.migrate(<String, Object?>{'v': 2}),
        isNull,
      );
    });
  });

  group('warmUp', () {
    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      RouteRestorationService.instance = RouteRestorationService();
    });

    test('restores the last location for a signed-in user', () async {
      final service = RouteRestorationService();
      await service.record('/history');

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, '/history');
    });

    test('redirects to auth when the route needs a session', () async {
      final service = RouteRestorationService();
      await service.record('/send');

      await service.warmUp(isAuthenticated: false);

      expect(
        service.initialLocation,
        RouteRestorationService.authRedirectLocation,
      );
    });

    test('home is not treated as something to restore', () async {
      final service = RouteRestorationService();
      await service.record('/');

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, isNull);
    });

    test('nothing persisted leaves initialLocation null', () async {
      final service = RouteRestorationService();

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, isNull);
    });

    test('never records a non-restorable location', () async {
      final service = RouteRestorationService();
      await service.record('/history');
      await service.record('/login');
      await service.record('/definitely-not-a-route');

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, '/history');
    });

    test('migrates a v1 payload and rewrites it as v2', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        RouteRestorationService.legacyRouteKey: '/receive',
      });
      final service = RouteRestorationService();

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, '/receive');

      final preferences = await SharedPreferences.getInstance();
      expect(
        preferences.getString(RouteRestorationService.legacyRouteKey),
        isNull,
      );
      final stored = jsonDecode(
        preferences.getString(RouteRestorationService.stateKey)!,
      ) as Map<String, dynamic>;
      expect(stored['v'], RouteRestorationService.schemaVersion);
      expect(stored['location'], '/receive');
    });

    test('a newer schema payload is ignored instead of crashing', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        RouteRestorationService.stateKey: jsonEncode(<String, Object?>{
          'v': RouteRestorationService.schemaVersion + 1,
          'location': '/send',
        }),
      });
      final service = RouteRestorationService();

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, isNull);
    });

    test('a corrupt payload is ignored', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        RouteRestorationService.stateKey: 'not json at all',
      });
      final service = RouteRestorationService();

      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, isNull);
    });

    test('clear forgets the route', () async {
      final service = RouteRestorationService();
      await service.record('/send');

      await service.clear();
      await service.warmUp(isAuthenticated: true);

      expect(service.initialLocation, isNull);
    });
  });
}
