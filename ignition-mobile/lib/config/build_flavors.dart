/// Build flavor configuration for the Ignition Mobile app.
///
/// Flavors: dev, staging, prod
enum BuildFlavor { dev, staging, prod }

class FlavorConfig {
  final BuildFlavor flavor;
  final String apiBaseUrl;
  final String appName;

  const FlavorConfig({
    required this.flavor,
    required this.apiBaseUrl,
    required this.appName,
  });

  static const dev = FlavorConfig(
    flavor: BuildFlavor.dev,
    apiBaseUrl: 'https://api-dev.ignitionpay.io',
    appName: 'Ignition Pay Dev',
  );

  static const staging = FlavorConfig(
    flavor: BuildFlavor.staging,
    apiBaseUrl: 'https://api-staging.ignitionpay.io',
    appName: 'Ignition Pay Staging',
  );

  static const prod = FlavorConfig(
    flavor: BuildFlavor.prod,
    apiBaseUrl: 'https://api.ignitionpay.io',
    appName: 'Ignition Pay',
  );

  static FlavorConfig get current {
    const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');
    switch (flavor) {
      case 'staging': return staging;
      case 'prod': return prod;
      default: return dev;
    }
  }
}
