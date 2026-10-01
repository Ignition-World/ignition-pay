enum WcNetwork {
  stellar,
  stellarTestnet,
  ethereum,
  polygon,
  arbitrum,
  optimism,
  base,
  bsc,
  solana,
  unknown;

  static WcNetwork parse(String? raw) {
    if (raw == null || raw.isEmpty) return WcNetwork.unknown;
    for (final network in WcNetwork.values) {
      if (network.wireName == raw) return network;
    }
    final lower = raw.toLowerCase();
    if (lower.contains('stellar')) {
      return lower.contains('test') ? WcNetwork.stellarTestnet : WcNetwork.stellar;
    }
    if (lower.contains('ethereum') || lower == 'eip155') return WcNetwork.ethereum;
    if (lower.contains('polygon')) return WcNetwork.polygon;
    if (lower.contains('arbitrum')) return WcNetwork.arbitrum;
    if (lower.contains('optimism')) return WcNetwork.optimism;
    if (lower.contains('base')) return WcNetwork.base;
    if (lower.contains('bsc') || lower.contains('binance')) return WcNetwork.bsc;
    if (lower.contains('solana')) return WcNetwork.solana;
    return WcNetwork.unknown;
  }

  String get wireName {
    switch (this) {
      case WcNetwork.stellar:
        return 'stellar';
      case WcNetwork.stellarTestnet:
        return 'stellar:testnet';
      case WcNetwork.ethereum:
        return 'eip155';
      case WcNetwork.polygon:
        return 'polygon';
      case WcNetwork.arbitrum:
        return 'arbitrum';
      case WcNetwork.optimism:
        return 'optimism';
      case WcNetwork.base:
        return 'base';
      case WcNetwork.bsc:
        return 'bsc';
      case WcNetwork.solana:
        return 'solana';
      case WcNetwork.unknown:
        return 'unknown';
    }
  }

  String get displayName {
    switch (this) {
      case WcNetwork.stellar:
        return 'Stellar';
      case WcNetwork.stellarTestnet:
        return 'Stellar Testnet';
      case WcNetwork.ethereum:
        return 'Ethereum';
      case WcNetwork.polygon:
        return 'Polygon';
      case WcNetwork.arbitrum:
        return 'Arbitrum';
      case WcNetwork.optimism:
        return 'Optimism';
      case WcNetwork.base:
        return 'Base';
      case WcNetwork.bsc:
        return 'BNB Chain';
      case WcNetwork.solana:
        return 'Solana';
      case WcNetwork.unknown:
        return 'Unknown';
    }
  }
}
