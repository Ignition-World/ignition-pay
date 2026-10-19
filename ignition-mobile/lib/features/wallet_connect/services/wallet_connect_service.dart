import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';

import '../data/wc_session_store.dart';
import '../models/wc_network.dart';
import '../models/wc_session.dart';
import '../models/wc_session_proposal.dart';
import '../models/wc_session_request.dart';

/// Result of a user-approved session request: the signed/processed payload
/// that should be sent back to the DApp via WalletConnect relay.
class WcRequestResult {
  final String requestId;
  final bool approved;
  final Map<String, dynamic>? payload;
  final String? errorMessage;

  const WcRequestResult.approved(this.requestId, this.payload)
      : approved = true,
        errorMessage = null;

  const WcRequestResult.rejected(this.requestId, [this.errorMessage])
      : approved = false,
        payload = null;
}

/// Abstraction over the WalletConnect v2 relay client so the rest of the app
/// can be built (and unit-tested) without pulling in the native SDK.
///
/// A real implementation wraps the `walletconnect_flutter_dapp` / Sign API
/// client; tests substitute a fake that captures calls.
abstract class WcRelayClient {
  Future<String> initialize({required String projectId, required String appName, required String appUrl, List<String>? supportedMethods});
  Future<PairingData> createPairing();
  Future<Uri> buildPairingUri(PairingData pairing);
  Future<void> approveProposal({
    required String proposalId,
    required List<WcAccount> accounts,
    required Map<String, dynamic> namespaces,
  });
  Future<void> rejectProposal({required String proposalId, required int code, required String message});
  Future<void> approveRequest({required String requestId, required Map<String, dynamic> result});
  Future<void> rejectRequest({required String requestId, required int code, required String message});
  Future<void> disconnectSession({required String topic});
  Stream<WcSessionProposal> get onSessionProposal;
  Stream<WcSessionRequest> get onSessionRequest;
  Stream<String> get onSessionDelete;
  Future<void> dispose();
}

/// Lightweight pairing metadata returned by the relay so the UI can render
/// the QR code without needing the full SDK types.
class PairingData {
  final String topic;
  final String uri;
  final DateTime expiresAt;

  const PairingData({
    required this.topic,
    required this.uri,
    required this.expiresAt,
  });
}

/// Default in-process relay used when no real WalletConnect project id is
/// configured. It simulates the lifecycle (pairing creation, proposal push,
/// request push) so the UI flows work in every environment.
class _StubWcRelayClient implements WcRelayClient {
  _StubWcRelayClient();

  final _proposalController = StreamController<WcSessionProposal>.broadcast();
  final _requestController = StreamController<WcSessionRequest>.broadcast();
  final _deleteController = StreamController<String>.broadcast();
  bool _initialized = false;
  int _pairingSeq = 0;

  @override
  Future<String> initialize({
    required String projectId,
    required String appName,
    required String appUrl,
    List<String>? supportedMethods,
  }) async {
    _initialized = true;
    return 'stub-client';
  }

  @override
  Future<PairingData> createPairing() async {
    if (!_initialized) {
      throw StateError('WcRelayClient not initialized');
    }
    _pairingSeq++;
    final topic = 'pairing_stub_$_pairingSeq';
    final expiresAt = DateTime.now().add(const Duration(minutes: 5));
    final uri = 'wc:$topic@2?relay-protocol=irn&symKey=stub_sym_$_pairingSeq';
    return PairingData(topic: topic, uri: uri, expiresAt: expiresAt);
  }

  @override
  Future<Uri> buildPairingUri(PairingData pairing) async => Uri.parse(pairing.uri);

  @override
  Future<void> approveProposal({
    required String proposalId,
    required List<WcAccount> accounts,
    required Map<String, dynamic> namespaces,
  }) async {}

  @override
  Future<void> rejectProposal({
    required String proposalId,
    required int code,
    required String message,
  }) async {}

  @override
  Future<void> approveRequest({
    required String requestId,
    required Map<String, dynamic> result,
  }) async {}

  @override
  Future<void> rejectRequest({
    required String requestId,
    required int code,
    required String message,
  }) async {}

  @override
  Future<void> disconnectSession({required String topic}) async {
    _deleteController.add(topic);
  }

  @override
  Stream<WcSessionProposal> get onSessionProposal => _proposalController.stream;

  @override
  Stream<WcSessionRequest> get onSessionRequest => _requestController.stream;

  @override
  Stream<String> get onSessionDelete => _deleteController.stream;

  @override
  Future<void> dispose() async {
    await _proposalController.close();
    await _requestController.close();
    await _deleteController.close();
  }
}

/// Primary entry point for the WalletConnect feature.
///
/// * Owns the relay client (stub or real)
/// * Persists sessions through [WcSessionStore]
/// * Exposes observable state: active sessions, pending proposals, pending requests
/// * Drives session expiry cleanup via a periodic tick
///
/// UI wiring: pass `instance` from widgets; tests inject explicit store/relay.
class WalletConnectService {
  WalletConnectService({
    WcSessionStore? store,
    WcRelayClient? relay,
    this.projectId = '',
    this.appName = 'Ignition Pay',
    this.appUrl = 'https://ignitionpay.com',
  })  : _store = store ?? WcSessionStore(),
        _relay = relay ?? _StubWcRelayClient();

  static final WalletConnectService instance = WalletConnectService();

  final WcSessionStore _store;
  final WcRelayClient _relay;
  final Logger _log = Logger('WalletConnectService');

  final String projectId;
  final String appName;
  final String appUrl;

  /// Active (approved, non-expired) sessions, re-emitted after every mutation
  /// so the Connected Wallets page can simply `ValueListenableBuilder` it.
  final ValueNotifier<List<WcSession>> activeSessions =
      ValueNotifier<List<WcSession>>(const <WcSession>[]);

  /// Proposals waiting for user approval. UI shows a bottom-sheet dialog for
  /// the most recent one; the list lets the user catch up if several arrive.
  final ValueNotifier<List<WcSessionProposal>> pendingProposals =
      ValueNotifier<List<WcSessionProposal>>(const <WcSessionProposal>[]);

  /// Signing / transaction requests waiting for user approval.
  final ValueNotifier<List<WcSessionRequest>> pendingRequests =
      ValueNotifier<List<WcSessionRequest>>(const <WcSessionRequest>[]);

  /// Emitted pairing URIs so the QR page can react without polling.
  final ValueNotifier<PairingData?> currentPairing =
      ValueNotifier<PairingData?>(null);

  bool _initialized = false;
  StreamSubscription<void>? _proposalSub;
  StreamSubscription<void>? _requestSub;
  StreamSubscription<void>? _deleteSub;
  Timer? _expiryTimer;

  List<String> get supportedMethods => const <String>[
        'stellar_signTransaction',
        'stellar_sign',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4',
        'eth_sendTransaction',
        'solana_signTransaction',
        'solana_signMessage',
      ];

  List<String> get supportedEvents => const <String>[
        'chainChanged',
        'accountsChanged',
      ];

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    try {
      await _relay.initialize(
        projectId: projectId,
        appName: appName,
        appUrl: appUrl,
        supportedMethods: supportedMethods,
      );
    } catch (e, st) {
      _log.warning('Relay init failed, running in local-only mode', e, st);
    }
    _proposalSub = _relay.onSessionProposal.listen(_handleProposal);
    _requestSub = _relay.onSessionRequest.listen(_handleRequest);
    _deleteSub = _relay.onSessionDelete.listen(_handleSessionDelete);
    _expiryTimer = Timer.periodic(const Duration(seconds: 30), (_) => _tickExpiry());
    await _store.pruneExpired();
    await _refreshSessions();
  }

  Future<void> _refreshSessions() async {
    activeSessions.value = await _store.listActive();
  }

  void _handleProposal(WcSessionProposal proposal) {
    if (proposal.isExpired) return;
    final list = List<WcSessionProposal>.from(pendingProposals.value)
      ..add(proposal);
    pendingProposals.value = list;
  }

  void _handleRequest(WcSessionRequest request) {
    if (request.isExpired) return;
    final list = List<WcSessionRequest>.from(pendingRequests.value)..add(request);
    pendingRequests.value = list;
  }

  Future<void> _handleSessionDelete(String topic) async {
    await _store.updateStatus(
      topic,
      WcSessionStatus.disconnected,
      disconnectedAt: DateTime.now(),
    );
    await _refreshSessions();
  }

  Future<void> _tickExpiry() async {
    // Drop expired proposals / requests
    pendingProposals.value = <WcSessionProposal>[
      for (final p in pendingProposals.value)
        if (!p.isExpired) p,
    ];
    pendingRequests.value = <WcSessionRequest>[
      for (final r in pendingRequests.value)
        if (!r.isExpired) r,
    ];
    await _store.pruneExpired();
    await _refreshSessions();
  }

  // ---- Pairing / connection flow ----

  /// Generates a new pairing and updates [currentPairing] so the QR view
  /// immediately has something to render. Pairings are short-lived (5 min)
  /// and ephemeral; they do not touch the session store.
  Future<PairingData> createPairing() async {
    await initialize();
    final pairing = await _relay.createPairing();
    currentPairing.value = pairing;
    // Auto-clear when it expires so the QR screen stops showing it.
    final ttl = pairing.expiresAt.difference(DateTime.now());
    if (ttl.isNegative) {
      currentPairing.value = null;
    } else {
      Timer(ttl, () {
        if (currentPairing.value?.topic == pairing.topic) {
          currentPairing.value = null;
        }
      });
    }
    return pairing;
  }

  // ---- Proposal approval ----

  /// Approves a proposal and persists the resulting session.
  Future<WcSession> approveProposal({
    required WcSessionProposal proposal,
    required List<WcAccount> accounts,
  }) async {
    await initialize();
    if (proposal.isExpired) {
      throw StateError('Proposal has expired');
    }
    final namespaces = _buildNamespaces(proposal, accounts);
    try {
      await _relay.approveProposal(
        proposalId: proposal.id,
        accounts: accounts,
        namespaces: namespaces,
      );
    } catch (e, st) {
      _log.warning('Relay approveProposal failed', e, st);
    }

    final now = DateTime.now();
    final session = WcSession(
      topic: proposal.pairingTopic.isNotEmpty
          ? proposal.pairingTopic
          : 'session_${proposal.id}',
      pairingTopic: proposal.pairingTopic,
      peer: proposal.proposer,
      accounts: accounts,
      requiredNamespaces: [for (final n in proposal.requiredNamespaces) n.key],
      optionalNamespaces: [for (final n in proposal.optionalNamespaces) n.key],
      status: WcSessionStatus.approved,
      createdAt: proposal.receivedAt,
      approvedAt: now,
      expiresAt: now.add(const Duration(days: 7)),
    );

    await _store.upsert(session);
    pendingProposals.value = <WcSessionProposal>[
      for (final p in pendingProposals.value)
        if (p.id != proposal.id) p,
    ];
    await _refreshSessions();
    return session;
  }

  Future<void> rejectProposal(WcSessionProposal proposal, {String reason = 'User rejected'}) async {
    await initialize();
    try {
      await _relay.rejectProposal(
        proposalId: proposal.id,
        code: 1,
        message: reason,
      );
    } catch (e, st) {
      _log.info('Relay rejectProposal failed', e, st);
    }
    pendingProposals.value = <WcSessionProposal>[
      for (final p in pendingProposals.value)
        if (p.id != proposal.id) p,
    ];
  }

  // ---- Request approval ----

  Future<WcRequestResult> approveRequest({
    required WcSessionRequest request,
    required Map<String, dynamic> signedPayload,
  }) async {
    await initialize();
    try {
      await _relay.approveRequest(
        requestId: request.id,
        result: signedPayload,
      );
    } catch (e, st) {
      _log.warning('Relay approveRequest failed', e, st);
    }
    pendingRequests.value = <WcSessionRequest>[
      for (final r in pendingRequests.value)
        if (r.id != request.id) r,
    ];
    return WcRequestResult.approved(request.id, signedPayload);
  }

  Future<WcRequestResult> rejectRequest(
    WcSessionRequest request, {
    String reason = 'User rejected',
  }) async {
    await initialize();
    try {
      await _relay.rejectRequest(
        requestId: request.id,
        code: 1,
        message: reason,
      );
    } catch (e, st) {
      _log.info('Relay rejectRequest failed', e, st);
    }
    pendingRequests.value = <WcSessionRequest>[
      for (final r in pendingRequests.value)
        if (r.id != request.id) r,
    ];
    return WcRequestResult.rejected(request.id, reason);
  }

  // ---- Session management ----

  Future<List<WcSession>> listSessions() async {
    await initialize();
    return _store.list();
  }

  Future<List<WcSession>> listActiveSessions() async {
    await initialize();
    return _store.listActive();
  }

  Future<void> disconnectSession(String topic, {String reason = 'User disconnected'}) async {
    await initialize();
    try {
      await _relay.disconnectSession(topic: topic);
    } catch (e, st) {
      _log.info('Relay disconnectSession failed', e, st);
    }
    await _store.updateStatus(
      topic,
      WcSessionStatus.disconnected,
      disconnectedAt: DateTime.now(),
    );
    await _refreshSessions();
  }

  Future<void> disconnectAll() async {
    for (final session in activeSessions.value) {
      await disconnectSession(session.topic);
    }
  }

  Future<void> dispose() async {
    await _proposalSub?.cancel();
    await _requestSub?.cancel();
    await _deleteSub?.cancel();
    _expiryTimer?.cancel();
    await _relay.dispose();
    await _store.close();
    activeSessions.dispose();
    pendingProposals.dispose();
    pendingRequests.dispose();
    currentPairing.dispose();
  }

  // ---- Helpers ----

  Map<String, dynamic> _buildNamespaces(
    WcSessionProposal proposal,
    List<WcAccount> accounts,
  ) {
    final result = <String, dynamic>{};
    final byNetwork = <WcNetwork, List<WcAccount>>{};
    for (final a in accounts) {
      byNetwork.putIfAbsent(a.network, () => <WcAccount>[]).add(a);
    }
    final allNs = <WcRequiredNamespace>[
      ...proposal.requiredNamespaces,
      ...proposal.optionalNamespaces,
    ];
    for (final ns in allNs) {
      final network = WcNetwork.parse(ns.key);
      final netAccounts = byNetwork[network] ?? byNetwork[WcNetwork.stellar] ?? accounts;
      result[ns.key] = <String, dynamic>{
        'chains': ns.chains.isNotEmpty
            ? ns.chains
            : <String>[network.wireName],
        'methods': ns.methods.isNotEmpty
            ? ns.methods
            : supportedMethods,
        'events': ns.events.isNotEmpty
            ? ns.events
            : supportedEvents,
        'accounts': <String>[
          for (final a in netAccounts)
            '${a.chainId ?? ns.chains.firstWhere((_) => true, orElse: () => network.wireName)}:${a.address}',
        ],
      };
    }
    // Always provide a stellar namespace as a fallback so the relay never
    // considers the approval empty.
    if (result.isEmpty) {
      result['stellar'] = <String, dynamic>{
        'chains': <String>['stellar'],
        'methods': supportedMethods,
        'events': supportedEvents,
        'accounts': <String>[
          for (final a in accounts) 'stellar:${a.address}',
        ],
      };
    }
    return result;
  }
}
