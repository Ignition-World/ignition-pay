import 'dart:convert';

import 'package:drift/drift.dart' show QueryExecutor;
import 'package:drift_flutter/drift_flutter.dart';

class CachedBalances {
  final String walletAddress;
  final Map<String, dynamic> balances;
  final DateTime updatedAt;

  const CachedBalances({
    required this.walletAddress,
    required this.balances,
    required this.updatedAt,
  });

  bool get isStale => DateTime.now().difference(updatedAt) > const Duration(seconds: 30);
}

/// Small Drift-backed store for non-sensitive, display-ready wallet balances.
/// The database is file-backed by drift_flutter, so values survive restarts.
class BalanceCache {
  BalanceCache({QueryExecutor? executor}) : _executor = executor ?? driftDatabase(name: 'balance_cache');

  final QueryExecutor _executor;
  bool _ready = false;

  Future<void> _ensureReady() async {
    if (_ready) return;
    await _executor.runCustom('''
      CREATE TABLE IF NOT EXISTS wallet_balance_cache (
        wallet_address TEXT PRIMARY KEY NOT NULL,
        balances_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''', const []);
    _ready = true;
  }

  Future<CachedBalances?> read(String walletAddress) async {
    await _ensureReady();
    final rows = await _executor.runSelect(
      'SELECT balances_json, updated_at FROM wallet_balance_cache WHERE wallet_address = ?',
      [walletAddress],
    );
    if (rows.isEmpty) return null;
    final row = rows.single;
    return CachedBalances(
      walletAddress: walletAddress,
      balances: Map<String, dynamic>.from(jsonDecode(row['balances_json']! as String) as Map),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(row['updated_at']! as int),
    );
  }

  Future<void> write(String walletAddress, Map<String, dynamic> balances) async {
    await _ensureReady();
    await _executor.runCustom(
      '''INSERT OR REPLACE INTO wallet_balance_cache
         (wallet_address, balances_json, updated_at) VALUES (?, ?, ?)''',
      [walletAddress, jsonEncode(balances), DateTime.now().millisecondsSinceEpoch],
    );
  }

  Future<void> invalidate(String walletAddress) async {
    await _ensureReady();
    await _executor.runCustom(
      'DELETE FROM wallet_balance_cache WHERE wallet_address = ?',
      [walletAddress],
    );
  }

  Future<void> close() => _executor.close();
}