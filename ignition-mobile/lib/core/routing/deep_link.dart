/// A deep link resolved to an in-app location.
class DeepLinkTarget {
  const DeepLinkTarget({
    required this.path,
    this.queryParameters = const <String, String>{},
  });

  /// In-app path understood by GoRouter, e.g. `/pay/GABC...`.
  final String path;

  /// Query parameters carried by the original link (amount, asset, memo, …).
  final Map<String, String> queryParameters;

  /// The full location string to hand to `GoRouter.go`, query included.
  String get location => Uri(
        path: path,
        queryParameters: queryParameters.isEmpty ? null : queryParameters,
      ).toString();

  @override
  String toString() => 'DeepLinkTarget($location)';
}

/// Resolves inbound deep links for the `ignitionpay://` custom scheme and the
/// `https://ignitionpay.com/...` universal links (issue #677).
///
/// Unsupported schemes/hosts/routes resolve to `null`, and
/// [DeepLinkResolver.locationFor] falls back to the home route so a malformed
/// link can never strand the user on the router's error page.
class DeepLinkResolver {
  const DeepLinkResolver._();

  /// Custom URL scheme registered in `AndroidManifest.xml` / `Info.plist`.
  static const String customScheme = 'ignitionpay';

  /// Hosts whose universal links belong to the app.
  static const Set<String> universalLinkHosts = <String>{
    'ignitionpay.com',
    'www.ignitionpay.com',
  };

  /// Route roots the app knows how to open from a link.
  static const Set<String> supportedRouteRoots = <String>{
    'pay',
    'send',
    'receive',
    'transaction',
  };

  /// Where unsupported links land.
  static const String homeLocation = '/';

  /// Resolves [uri] to a [DeepLinkTarget], or `null` when it is not a
  /// supported deep link.
  static DeepLinkTarget? resolve(Uri uri) {
    final segments = _routeSegments(uri);
    if (segments == null) return null;

    if (segments.isEmpty) {
      return DeepLinkTarget(
        path: homeLocation,
        queryParameters: uri.queryParameters,
      );
    }

    if (!supportedRouteRoots.contains(segments.first)) return null;

    return DeepLinkTarget(
      path: '/${segments.join('/')}',
      queryParameters: uri.queryParameters,
    );
  }

  /// Convenience wrapper for callers that just need somewhere safe to go.
  static String locationFor(Uri uri) =>
      resolve(uri)?.location ?? homeLocation;

  /// Extracts the in-app route segments, or null when the scheme/host is not
  /// recognised.
  static List<String>? _routeSegments(Uri uri) {
    if (uri.scheme == customScheme) {
      // `ignitionpay://pay/GABC` puts the route root in the host position.
      return <String>[
        if (uri.host.isNotEmpty) uri.host,
        ...uri.pathSegments,
      ];
    }
    if ((uri.scheme == 'http' || uri.scheme == 'https') &&
        universalLinkHosts.contains(uri.host)) {
      return uri.pathSegments;
    }
    return null;
  }
}
