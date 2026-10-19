import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/design_system/app_button.dart';
import '../../../core/design_system/app_colors.dart';
import '../../../core/design_system/design_system.dart';
import '../models/wc_session.dart';
import '../models/wc_session_proposal.dart';
import '../models/wc_session_request.dart';
import '../services/wallet_connect_service.dart';
import '../widgets/connected_wallet_tile.dart';
import '../widgets/session_proposal_dialog.dart';
import '../widgets/session_request_dialog.dart';
import '../widgets/wc_qr_view.dart';

/// Main WalletConnect screen: displays the pairing QR generator on top and
/// the list of currently connected DApps below.
///
/// Also acts as the app-wide coordinator for pending proposals and signing
/// requests — it listens to the service observables and pushes the
/// corresponding approval dialogs whenever new items arrive. This keeps
/// dialog logic out of the home page and out of the router.
class WalletConnectPage extends StatefulWidget {
  const WalletConnectPage({
    super.key,
    this.service,
    this.autoPrompt = true,
  });

  final WalletConnectService? service;

  /// If true, pending proposals and requests auto-open dialogs when this
  /// page is mounted. Tests and nested usages disable the prompting.
  final bool autoPrompt;

  @override
  State<WalletConnectPage> createState() => _WalletConnectPageState();
}

class _WalletConnectPageState extends State<WalletConnectPage> {
  late final WalletConnectService _service =
      widget.service ?? WalletConnectService.instance;
  bool _dialogOpen = false;
  StreamSubscription<void>? _proposalPoll;

  @override
  void initState() {
    super.initState();
    unawaited(_service.initialize().then((_) => _refresh()));
    if (widget.autoPrompt) {
      // Service observables are ValueListenables — poll rather than adding
      // ad-hoc streams so every transition (page load, new proposal while
      // the user is on this page, proposal rejection from another dialog)
      // reliably triggers a prompt attempt.
      _proposalPoll = Stream<void>.periodic(const Duration(milliseconds: 500))
          .listen((_) => _drainPending());
      WidgetsBinding.instance.addPostFrameCallback((_) => _drainPending());
    }
  }

  @override
  void dispose() {
    _proposalPoll?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (!mounted) return;
    // read-through: ValueListenables already update the UI reactively, but
    // this ensures first load always reflects what's in the store.
    await _service.listActiveSessions();
    if (mounted) setState(() {});
  }

  /// Pops a dialog for each pending proposal/request in serial order. The
  /// serial guard (`_dialogOpen`) prevents double-showing if the 500ms tick
  /// fires while a dialog is already awaiting.
  Future<void> _drainPending() async {
    if (!mounted || _dialogOpen) return;
    if (!widget.autoPrompt) return;
    final proposals = _service.pendingProposals.value;
    if (proposals.isNotEmpty) {
      _dialogOpen = true;
      try {
        await SessionProposalDialog.show(
          context,
          proposal: proposals.first,
          service: _service,
        );
      } finally {
        if (mounted) {
          _dialogOpen = false;
          WidgetsBinding.instance.addPostFrameCallback((_) => _drainPending());
        }
      }
      return;
    }
    final requests = _service.pendingRequests.value;
    if (requests.isNotEmpty) {
      _dialogOpen = true;
      try {
        await SessionRequestDialog.show(
          context,
          request: requests.first,
          service: _service,
        );
      } finally {
        if (mounted) {
          _dialogOpen = false;
          WidgetsBinding.instance.addPostFrameCallback((_) => _drainPending());
        }
      }
    }
  }

  Future<void> _disconnect(WcSession session) async {
    final confirmed = await _confirmDisconnect(session);
    if (confirmed == true) {
      await _service.disconnectSession(session.topic);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('DApp disconnected')),
        );
      }
    }
  }

  Future<bool?> _confirmDisconnect(WcSession session) {
    return showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Disconnect DApp?'),
        content: Text(
          '${session.peer.name} will no longer be able to request signatures or view your accounts.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(c).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(c).colorScheme.error,
              foregroundColor: Theme.of(c).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(c).pop(true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('WalletConnect'),
        actions: [
          ValueListenableBuilder<List<WcSessionProposal>>(
            valueListenable: _service.pendingProposals,
            builder: (_, proposals, __) {
              return ValueListenableBuilder<List<WcSessionRequest>>(
                valueListenable: _service.pendingRequests,
                builder: (_, requests, ___) {
                  final total = proposals.length + requests.length;
                  if (total == 0) return const SizedBox.shrink();
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 16),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '$total pending',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onPrimary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            const _SectionHeader(title: 'Connect a DApp'),
            const SizedBox(height: 12),
            WcQrView(service: _service),
            const SizedBox(height: 28),
            Row(
              children: [
                const Expanded(child: _SectionHeader(title: 'Connected Wallets')),
                ValueListenableBuilder<List<WcSession>>(
                  valueListenable: _service.activeSessions,
                  builder: (_, sessions, __) {
                    if (sessions.isEmpty) return const SizedBox.shrink();
                    return TextButton(
                      onPressed: () => _showDisconnectAll(sessions.length),
                      child: Text(
                        'Disconnect all',
                        style: TextStyle(color: theme.colorScheme.error),
                      ),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            ValueListenableBuilder<List<WcSession>>(
              valueListenable: _service.activeSessions,
              builder: (_, sessions, __) {
                if (sessions.isEmpty) {
                  return const _EmptyConnectedState();
                }
                return Column(
                  children: [
                    for (int i = 0; i < sessions.length; i++) ...[
                      ConnectedWalletTile(
                        session: sessions[i],
                        onDisconnect: () => _disconnect(sessions[i]),
                      ),
                      if (i != sessions.length - 1) const SizedBox(height: 10),
                    ],
                  ],
                );
              },
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Future<void> _showDisconnectAll(int count) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Disconnect all DApps?'),
        content: Text(
          'This will end $count active session${count == 1 ? '' : 's'}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(c).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(c).colorScheme.error,
              foregroundColor: Theme.of(c).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(c).pop(true),
            child: const Text('Disconnect all'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _service.disconnectAll();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('All DApps disconnected')),
        );
      }
    }
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      title,
      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}

class _EmptyConnectedState extends StatelessWidget {
  const _EmptyConnectedState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(Icons.wallet_rounded, size: 48, color: theme.colorScheme.primary.withValues(alpha: 0.5)),
          const SizedBox(height: 12),
          Text(
            'No DApps connected yet',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            'Scan the QR code above from a DApp to connect.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}
