import 'wc_network.dart';
import 'wc_session.dart';

class WcRequiredNamespace {
  final String key;
  final List<String> chains;
  final List<String> methods;
  final List<String> events;

  const WcRequiredNamespace({
    required this.key,
    required this.chains,
    required this.methods,
    required this.events,
  });

  factory WcRequiredNamespace.fromPayload(Map<String, dynamic> payload) {
    return WcRequiredNamespace(
      key: payload['key'] as String? ?? payload['namespace'] as String? ?? '',
      chains: _stringList(payload['chains']),
      methods: _stringList(payload['methods']),
      events: _stringList(payload['events']),
    );
  }

  Map<String, dynamic> toPayload() => <String, dynamic>{
        'key': key,
        'chains': chains,
        'methods': methods,
        'events': events,
      };
}

class WcSessionProposal {
  final String id;
  final String pairingTopic;
  final WcPeerMeta proposer;
  final List<WcRequiredNamespace> requiredNamespaces;
  final List<WcRequiredNamespace> optionalNamespaces;
  final List<WcNetwork> supportedNetworks;
  final DateTime expiresAt;
  final DateTime receivedAt;
  final Map<String, dynamic> rawPayload;

  const WcSessionProposal({
    required this.id,
    required this.pairingTopic,
    required this.proposer,
    required this.requiredNamespaces,
    required this.optionalNamespaces,
    required this.supportedNetworks,
    required this.expiresAt,
    required this.receivedAt,
    required this.rawPayload,
  });

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  List<String> get allMethods => [
        for (final ns in requiredNamespaces) ...ns.methods,
        for (final ns in optionalNamespaces) ...ns.methods,
      ];

  List<String> get allChains => [
        for (final ns in requiredNamespaces) ...ns.chains,
        for (final ns in optionalNamespaces) ...ns.chains,
      ];

  factory WcSessionProposal.fromPayload(Map<String, dynamic> payload) {
    final proposerPayload =
        payload['proposer'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final requiredNs = _parseNamespaces(payload['requiredNamespaces']);
    final optionalNs = _parseNamespaces(payload['optionalNamespaces']);
    final chains = <String>{
      for (final ns in requiredNs) ...ns.chains,
      for (final ns in optionalNs) ...ns.chains,
    };
    final networks = <WcNetwork>{
      for (final chain in chains) WcNetwork.parse(chain),
    }.toList()
      ..remove(WcNetwork.unknown);
    final exp = payload['expiryTimestamp'] as int? ??
        payload['expiresAt'] as int? ??
        DateTime.now().millisecondsSinceEpoch + 300000;
    return WcSessionProposal(
      id: payload['id'] as String? ?? payload['proposalId'] as String? ?? _generateId(),
      pairingTopic:
          payload['pairingTopic'] as String? ?? payload['topic'] as String? ?? '',
      proposer: WcPeerMeta.fromPayload(proposerPayload),
      requiredNamespaces: requiredNs,
      optionalNamespaces: optionalNs,
      supportedNetworks: networks,
      expiresAt: DateTime.fromMillisecondsSinceEpoch(exp),
      receivedAt: DateTime.now(),
      rawPayload: payload,
    );
  }
}

List<WcRequiredNamespace> _parseNamespaces(dynamic raw) {
  if (raw is Map) {
    return <WcRequiredNamespace>[
      for (final entry in raw.entries)
        WcRequiredNamespace.fromPayload(
          <String, dynamic>{
            'key': entry.key.toString(),
            ...Map<String, dynamic>.from(entry.value as Map? ?? const {}),
          },
        ),
    ];
  }
  if (raw is List) {
    return <WcRequiredNamespace>[
      for (final item in raw)
        if (item is Map)
          WcRequiredNamespace.fromPayload(Map<String, dynamic>.from(item)),
    ];
  }
  return const <WcRequiredNamespace>[];
}

List<String> _stringList(dynamic raw) {
  if (raw is List) return raw.whereType<String>().toList();
  return const <String>[];
}

String _generateId() {
  final now = DateTime.now().millisecondsSinceEpoch;
  final rand = now.hashCode.toRadixString(36);
  return 'prop_${now}_$rand';
}
