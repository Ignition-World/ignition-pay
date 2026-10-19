import '../../../core/network/api_client.dart';

/// Contract for the datasets rendered on the Home page.
///
/// The production implementation is [HomeService]; tests provide fakes so
/// widget tests can verify what a pull-to-refresh reloads.
abstract class HomeDataSource {
  /// Wallet balances keyed by currency code, e.g. `{'USD': '12.50'}`.
  Future<Map<String, dynamic>> fetchBalances();

  /// Recent transactions, newest first.
  Future<List<Map<String, dynamic>>> fetchTransactions();

  /// Unread notifications, newest first.
  Future<List<Map<String, dynamic>>> fetchNotifications();
}

/// Serves Home page data from `GET /users/me/dashboard`.
///
/// All three slices come from the same dashboard payload, so concurrent
/// requests are coalesced into a single in-flight HTTP call: a pull-to-refresh
/// that awaits balances, transactions and notifications together only hits the
/// network once. The in-flight request is cleared when it settles — on
/// success or failure — so the next refresh performs a fresh fetch.
class HomeService implements HomeDataSource {
  HomeService({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;
  Future<Map<String, dynamic>>? _inflight;

  @override
  Future<Map<String, dynamic>> fetchBalances() async {
    final dashboard = await _dashboard();
    final balances = <String, dynamic>{};
    final wallets = dashboard['wallets'];
    if (wallets is List<dynamic>) {
      for (final wallet in wallets) {
        if (wallet is Map<dynamic, dynamic>) {
          final entry = Map<String, dynamic>.from(wallet);
          final label = entry['currency'] ?? entry['network'] ?? entry['id'];
          final balance = entry['balance'];
          if (label != null && balance != null) {
            balances[label.toString()] = balance;
          }
        }
      }
    }
    return balances;
  }

  @override
  Future<List<Map<String, dynamic>>> fetchTransactions() async {
    final dashboard = await _dashboard();
    return _asMapList(dashboard['recentTransactions']);
  }

  @override
  Future<List<Map<String, dynamic>>> fetchNotifications() async {
    final dashboard = await _dashboard();
    return _asMapList(dashboard['unreadNotifications']);
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List<dynamic>) return const <Map<String, dynamic>>[];
    return <Map<String, dynamic>>[
      for (final item in value)
        if (item is Map<dynamic, dynamic>) Map<String, dynamic>.from(item),
    ];
  }

  Future<Map<String, dynamic>> _dashboard() {
    final existing = _inflight;
    if (existing != null) return existing;

    // whenComplete runs in a microtask — always after the synchronous
    // assignment below — so the slot is cleared exactly once the request
    // settles, whether it succeeds or fails, and never before it has been
    // stored.
    final request = _fetchDashboard().whenComplete(_dashboardSettled);
    _inflight = request;
    return request;
  }

  void _dashboardSettled() {
    _inflight = null;
  }

  Future<Map<String, dynamic>> _fetchDashboard() async {
    final response = await _apiClient.get<dynamic>('/users/me/dashboard');
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    if (data is Map<dynamic, dynamic>) return Map<String, dynamic>.from(data);
    return <String, dynamic>{};
  }
}
