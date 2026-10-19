import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists the last visited route so a warm launch reopens where the user
/// was instead of always landing on home (issue #698).
///
/// ## Storage schema
///
/// ```text
/// v1 (legacy)  warm_launch.route        -> '/send'
/// v2 (current) warm_launch.state        -> '{"v":2,"location":"/send","at":1727...}'
/// ```
///
/// [migrate] upgrades v1 payloads in place and discards payloads written by a
/// **newer** schema, so downgrading the app cannot crash it.
///
/// ## Warm launch flow
///
/// 1. `main()` calls [warmUp] before the first frame (a single
///    SharedPreferences read) and passes the current auth state.
/// 2. The router is built with [initialLocation], so the restored screen is
///    the first route — no home flash, no animation.
/// 3. [attachTo] records every subsequent navigation.
/// 4. Deep links win: they call `router.go(...)` after the router is mounted,
///    which overrides [initialLocation].
class RouteRestorationService {
  RouteRestorationService({SharedPreferences? preferences})
      : _preferences = preferences;

  /// Process-wide instance used by `main()` and the router.
  static RouteRestorationService instance = RouteRestorationService();

  /// Current storage schema version.
  static const int schemaVersion = 2;

  /// Key holding the v2 JSON payload.
  static const String stateKey = 'warm_launch.state';

  /// Legacy v1 key holding a bare location string.
  static const String legacyRouteKey = 'warm_launch.route';

  /// Longest location we are willing to persist/restore.
  static const int maxLocationLength = 2048;

  /// Route prefixes that may be restored, ordered longest-first where it
  /// matters. `/login` is deliberately absent: remembering the sign-in screen
  /// has no value, and restoring into it hides the fact that the user was
  /// signed out.
  static const List<String> restorablePrefixes = <String>[
    '/',
    '/send',
    '/pay/',
    '/pending-sends',
    '/receive',
    '/history',
    '/transaction/',
    '/settings',
    '/notifications',
  ];

  /// Routes that require an authenticated session. If the last route needs
  /// auth and the user is signed out, the app opens on `/login` instead.
  static const List<String> authRequiredPrefixes = <String>[
    '/send',
    '/pay/',
    '/pending-sends',
    '/receive',
    '/history',
    '/transaction/',
    '/settings/security',
  ];

  /// Where a signed-out user is sent when the restored route needs auth.
  static const String authRedirectLocation = '/login';

  SharedPreferences? _preferences;

  String? _initialLocation;

  /// The location the app should open on, or null to use the router default.
  ///
  /// Only populated by [warmUp]; null when there is nothing to restore, when
  /// the saved route is not restorable, or when it resolved to home.
  String? get initialLocation => _initialLocation;

  /// Reads the persisted state and resolves [initialLocation].
  ///
  /// Call before building the router. Never throws: a corrupt payload or a
  /// denied preference store simply means "nothing to restore".
  Future<void> warmUp({required bool isAuthenticated}) async {
    final String? saved;
    try {
      saved = await _readLocation();
    } on Object {
      _initialLocation = null;
      return;
    }

    final resolved = resolveInitialLocation(
      saved: saved,
      isAuthenticated: isAuthenticated,
    );
    _initialLocation = resolved == '/' ? null : resolved;
  }

  /// Persists [location] when it is restorable. Non-restorable locations leave
  /// the previous value untouched.
  Future<void> record(String location) async {
    if (!isRestorable(location)) return;
    try {
      final preferences = await _ensurePreferences();
      await preferences.setString(
        stateKey,
        jsonEncode(<String, Object?>{
          'v': schemaVersion,
          'location': location,
          'at': DateTime.now().millisecondsSinceEpoch,
        }),
      );
      await preferences.remove(legacyRouteKey);
    } on Object {
      // Recording is best-effort: losing it only costs a restore.
    }
  }

  /// Starts recording navigations from [router].
  ///
  /// Returns the listener so callers (tests) can detach it.
  VoidCallback attachTo(GoRouter router) {
    void listener() {
      final uri = router.routeInformationProvider.value.uri;
      // Only the path is restored; query parameters of a payment link can be
      // stale or sensitive and are not needed to reach the screen.
      unawaited(record(uri.path));
    }

    router.routeInformationProvider.addListener(listener);
    return () => router.routeInformationProvider.removeListener(listener);
  }

  /// Forgets the persisted route (used by tests and by sign-out flows).
  Future<void> clear() async {
    try {
      final preferences = await _ensurePreferences();
      await preferences.remove(stateKey);
      await preferences.remove(legacyRouteKey);
      _initialLocation = null;
    } on Object {
      // Nothing stored is a valid end state.
    }
  }

  /// Pure resolution used by [warmUp] and unit tested directly.
  ///
  /// Returns null when there is nothing to restore, [authRedirectLocation]
  /// when the saved route needs a session the user does not have, and the
  /// saved location otherwise.
  static String? resolveInitialLocation({
    required String? saved,
    required bool isAuthenticated,
  }) {
    if (saved == null) return null;
    if (!isRestorable(saved)) return null;
    if (requiresAuth(saved) && !isAuthenticated) return authRedirectLocation;
    return saved;
  }

  /// Whether [location] is a route the app knows how to reopen.
  static bool isRestorable(String location) {
    if (location.isEmpty || location.length > maxLocationLength) return false;
    if (!location.startsWith('/')) return false;
    if (location.contains('..')) return false;
    final path = _pathOf(location);
    if (path == authRedirectLocation) return false;
    return restorablePrefixes.any((prefix) => _matchesPrefix(path, prefix));
  }

  /// Whether [location] needs an authenticated session.
  static bool requiresAuth(String location) {
    final path = _pathOf(location);
    return authRequiredPrefixes.any((prefix) => _matchesPrefix(path, prefix));
  }

  /// Segment-aware prefix match: `/settings` matches `/settings` and
  /// `/settings/security` but never `/settings-evil`.
  static bool _matchesPrefix(String path, String prefix) {
    if (prefix == '/') return path == '/';
    if (prefix.endsWith('/')) return path.startsWith(prefix);
    return path == prefix || path.startsWith('$prefix/');
  }

  /// Migrates a decoded payload to the current schema.
  ///
  /// Returns null when the payload cannot be understood or was written by a
  /// newer app version.
  @visibleForTesting
  static Map<String, Object?>? migrate(Map<String, Object?> raw) {
    final version = raw['v'];
    if (version is int && version > schemaVersion) return null;

    if (version == schemaVersion) {
      final location = raw['location'];
      if (location is! String) return null;
      return <String, Object?>{'v': schemaVersion, 'location': location};
    }

    // v1 and version-less payloads stored the location under `route`.
    final legacyLocation = raw['route'] ?? raw['location'];
    if (legacyLocation is! String) return null;
    return <String, Object?>{'v': schemaVersion, 'location': legacyLocation};
  }

  Future<String?> _readLocation() async {
    final preferences = await _ensurePreferences();

    final raw = preferences.getString(stateKey);
    if (raw != null) {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        final migrated = migrate(Map<String, Object?>.from(decoded));
        if (migrated != null) {
          final location = migrated['location'] as String;
          // Rewrite legacy payloads in the current schema so the next launch
          // does not migrate again.
          if (preferences.getString(legacyRouteKey) != null ||
              decoded['v'] != schemaVersion) {
            await record(location);
          }
          return location;
        }
      }
      return null;
    }

    final legacy = preferences.getString(legacyRouteKey);
    if (legacy == null) return null;
    await record(legacy);
    return legacy;
  }

  Future<SharedPreferences> _ensurePreferences() async {
    return _preferences ??= await SharedPreferences.getInstance();
  }

  static String _pathOf(String location) {
    final query = location.indexOf('?');
    return query == -1 ? location : location.substring(0, query);
  }
}

/// The session signal used to gate restored routes (issue #698).
///
/// The app does not have a session store yet: the API client reads the bearer
/// token from `.env` (see `ApiClient.initialize`), so the presence of a token
/// is the only available "signed in" signal. When a real session store lands,
/// swap this function out — [RouteRestorationService.resolveInitialLocation]
/// already takes the boolean it returns.
bool defaultIsAuthenticated() {
  try {
    final token = dotenv.env['AUTH_TOKEN'];
    return token != null && token.isNotEmpty;
  } on Object {
    return false;
  }
}
