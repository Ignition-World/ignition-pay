class AppConstants {
  static const String appName = 'Ignition Pay';
  static const String version = '0.1.0';

  // API base URLs per environment
  static const String apiBaseUrlDevelopment = 'http://localhost:3000';
  static const String apiBaseUrlStaging = 'https://staging-api.ignitionpay.com';
  static const String apiBaseUrlProduction = 'https://api.ignitionpay.com';

  // API prefix
  static const String apiPrefix = '/api/v1';

  // Timeout configuration (milliseconds)
  static const int defaultTimeout = 30000;
  static const int uploadTimeout = 120000;
  static const int longRunningTimeout = 300000;

  // Retry configuration
  static const int maxRetries = 3;
  static const int retryBaseDelayMs = 1000;
  static const int retryMaxDelayMs = 10000;
  static const double retryBackoffFactor = 2.0;

  // Pagination defaults
  static const int defaultPage = 1;
  static const int defaultPageLimit = 20;
  static const int maxPageLimit = 100;

  // ---------------------------------------------------------------------------
  // API endpoint paths
  // ---------------------------------------------------------------------------

  // Auth
  static const String authChallenge = '/auth/challenge';
  static const String authVerify = '/auth/verify';
  static const String authRefresh = '/auth/refresh';
  static const String authLogout = '/auth/logout';
  static const String authSessions = '/auth/sessions';

  // Users
  static const String usersRegister = '/users/register';
  static const String usersConfirmEmail = '/users/confirm-email';
  static const String usersLogin = '/users/login';
  static const String usersMe = '/users/me';
  static const String usersProfile = '/users/profile';
  static const String usersPasswordSetup = '/users/password/setup';
  static const String usersPasswordChange = '/users/password';

  // Wallets
  static const String wallets = '/wallets';

  // Campaigns
  static const String campaigns = '/campaigns';

  // Transactions
  static const String transactions = '/transactions';

  // Addresses
  static const String addresses = '/addresses';
  static const String addressesGenerate = '/addresses/generate';

  // API Keys
  static const String apiKeys = '/api-keys';

  // Health
  static const String health = '/health';
  static const String healthReady = '/health/ready';
}
