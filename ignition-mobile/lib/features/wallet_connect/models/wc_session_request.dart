import 'wc_network.dart';
import 'wc_session.dart';

enum WcRequestType {
  stellarTransaction,
  stellarSign,
  ethTransaction,
  ethSign,
  ethSignTypedData,
  personalSign,
  solanaSignTransaction,
  solanaSignMessage,
  unknown;

  static WcRequestType parse(String? method, {String? chainId}) {
    if (method == null) return WcRequestType.unknown;
    final m = method.toLowerCase();
    final network = WcNetwork.parse(chainId);
    if (network == WcNetwork.stellar || network == WcNetwork.stellarTestnet ||
        (chainId != null && chainId.toLowerCase().contains('stellar'))) {
      if (m.contains('transaction')) return WcRequestType.stellarTransaction;
      return WcRequestType.stellarSign;
    }
    if (m == 'personal_sign') return WcRequestType.personalSign;
    if (m.contains('sign_typed_data')) return WcRequestType.ethSignTypedData;
    if (m == 'eth_sign') return WcRequestType.ethSign;
    if (m.contains('send_transaction') || m.contains('sign_transaction')) {
      return WcRequestType.ethTransaction;
    }
    if ((chainId != null && chainId.toLowerCase().contains('solana')) ||
        network == WcNetwork.solana) {
      if (m.contains('transaction')) return WcRequestType.solanaSignTransaction;
      if (m.contains('message')) return WcRequestType.solanaSignMessage;
    }
    return WcRequestType.unknown;
  }

  String get displayName {
    switch (this) {
      case WcRequestType.stellarTransaction:
        return 'Stellar Transaction';
      case WcRequestType.stellarSign:
        return 'Sign Stellar Data';
      case WcRequestType.ethTransaction:
        return 'Ethereum Transaction';
      case WcRequestType.ethSign:
        return 'Sign Data';
      case WcRequestType.ethSignTypedData:
        return 'Sign Typed Data';
      case WcRequestType.personalSign:
        return 'Personal Sign';
      case WcRequestType.solanaSignTransaction:
        return 'Solana Transaction';
      case WcRequestType.solanaSignMessage:
        return 'Sign Solana Message';
      case WcRequestType.unknown:
        return 'Unknown Request';
    }
  }
}

class WcSessionRequest {
  final String id;
  final String topic;
  final String method;
  final List<dynamic> params;
  final String? chainId;
  final WcNetwork network;
  final WcRequestType type;
  final WcPeerMeta dapp;
  final DateTime receivedAt;
  final DateTime expiresAt;
  final Map<String, dynamic> rawPayload;

  const WcSessionRequest({
    required this.id,
    required this.topic,
    required this.method,
    required this.params,
    required this.network,
    required this.type,
    required this.dapp,
    required this.receivedAt,
    required this.expiresAt,
    required this.rawPayload,
    this.chainId,
  });

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  bool get isTransaction =>
      type == WcRequestType.stellarTransaction ||
      type == WcRequestType.ethTransaction ||
      type == WcRequestType.solanaSignTransaction;

  String get readableParams {
    if (params.isEmpty) return '';
    if (params.length == 1) {
      final p = params.first;
      if (p is Map) return _summarizeMap(p);
      if (p is String) {
        if (p.length > 80) return '${p.substring(0, 80)}...';
        return p;
      }
      return p.toString();
    }
    return '${params.length} parameters';
  }

  factory WcSessionRequest.fromPayload({
    required Map<String, dynamic> payload,
    required WcPeerMeta dapp,
  }) {
    final paramsRaw = payload['params'];
    final params = paramsRaw is List ? paramsRaw : const <dynamic>[];
    final chainId =
        payload['chainId'] as String? ??
        (params.isNotEmpty && params.first is Map
            ? (params.first as Map)['chainId']?.toString()
            : null);
    final method = payload['method'] as String? ?? '';
    return WcSessionRequest(
      id: payload['id']?.toString() ?? _generateId(),
      topic: payload['topic'] as String? ?? '',
      method: method,
      params: params,
      chainId: chainId,
      network: WcNetwork.parse(chainId),
      type: WcRequestType.parse(method, chainId: chainId),
      dapp: dapp,
      receivedAt: DateTime.now(),
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      rawPayload: payload,
    );
  }
}

String _summarizeMap(Map map) {
  final keys = map.keys.take(5).toList();
  final parts = <String>[];
  for (final k in keys) {
    final v = map[k];
    final vs = v is Map
        ? '{...}'
        : v is List
            ? '[${v.length}]'
            : v?.toString().length > 30
                ? '${v.toString().substring(0, 30)}...'
                : v?.toString() ?? '';
    parts.add('$k: $vs');
  }
  return parts.join(', ');
}

String _generateId() {
  final now = DateTime.now().millisecondsSinceEpoch;
  final rand = now.hashCode.toRadixString(36);
  return 'req_${now}_$rand';
}
