import 'package:flutter/material.dart';

import '../../../core/design_system/app_button.dart';
import '../../../core/design_system/app_card.dart';
import '../../../core/design_system/app_colors.dart';
import '../../../core/design_system/design_system.dart';
import '../models/wc_network.dart';
import '../models/wc_session.dart';
import '../models/wc_session_proposal.dart';
import '../services/wallet_connect_service.dart';

/// Modal dialog shown when a DApp proposes a new WalletConnect session.
///
/// Displays the DApp metadata (name, URL, icon), the namespaces and methods
/// requested, and Approve / Reject actions. The returned future resolves to
/// the chosen accounts on approve, or `null` on reject.
class SessionProposalDialog extends StatefulWidget {
  const SessionProposalDialog({
    super.key,
    required this.proposal,
    this.service,
    this.availableAccounts,
  });

  final WcSessionProposal proposal;
  final WalletConnectService? service;

  /// Accounts the user can select to share. When null, a single Stellar
  /// placeholder account is used so the dialog is always demoable.
  final List<WcAccount>? availableAccounts;

  static Future<List<WcAccount>?> show(
    BuildContext context, {
    required WcSessionProposal proposal,
    WalletConnectService? service,
    List<WcAccount>? availableAccounts,
  }) {
    return showModalBottomSheet<List<WcAccount>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        expand: false,
        builder: (_, controller) => SessionProposalDialog(
          proposal: proposal,
          service: service,
          availableAccounts: availableAccounts,
        ),
      ),
    );
  }

  @override
  State<SessionProposalDialog> createState() => _SessionProposalDialogState();
}

class _SessionProposalDialogState extends State<SessionProposalDialog> {
  late final WalletConnectService _service =
      widget.service ?? WalletConnectService.instance;
  late final Set<String> _selectedAddresses = <String>{};

  List<WcAccount> get _accounts {
    if (widget.availableAccounts != null && widget.availableAccounts!.isNotEmpty) {
      return widget.availableAccounts!;
    }
    return const <WcAccount>[
      WcAccount(address: 'GDEMO00000000000000000000000000000000000000000000000001', network: WcNetwork.stellar),
    ];
  }

  @override
  void initState() {
    super.initState();
    if (_accounts.isNotEmpty) _selectedAddresses.add(_accounts.first.address);
  }

  bool get _canApprove =>
      _selectedAddresses.isNotEmpty && !widget.proposal.isExpired;

  Future<void> _approve() async {
    if (!_canApprove) return;
    final accounts = <WcAccount>[
      for (final a in _accounts)
        if (_selectedAddresses.contains(a.address)) a,
    ];
    try {
      await _service.approveProposal(
        proposal: widget.proposal,
        accounts: accounts,
      );
      if (mounted) Navigator.of(context).pop(accounts);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to approve: $e')),
        );
      }
    }
  }

  Future<void> _reject() async {
    await _service.rejectProposal(widget.proposal);
    if (mounted) Navigator.of(context).pop(null);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final proposer = widget.proposal.proposer;
    final hasRequired = widget.proposal.requiredNamespaces.isNotEmpty;
    final hasOptional = widget.proposal.optionalNamespaces.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _DAppAvatar(url: proposer.firstIcon, name: proposer.name),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          proposer.name,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        if (proposer.displayHost.isNotEmpty)
                          Text(
                            proposer.displayHost,
                            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'would like to connect to your wallet',
                style: theme.textTheme.bodyMedium,
              ),
              if (proposer.description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  proposer.description,
                  style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
                ),
              ],
              const SizedBox(height: 20),
              Expanded(
                child: ListView(
                  children: [
                    if (hasRequired || hasOptional) ...[
                      Text(
                        'Permissions requested',
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      for (final ns in widget.proposal.requiredNamespaces)
                        _NamespaceTile(namespace: ns, required: true),
                      for (final ns in widget.proposal.optionalNamespaces)
                        _NamespaceTile(namespace: ns, required: false),
                      const SizedBox(height: 16),
                    ],
                    if (widget.proposal.supportedNetworks.isNotEmpty) ...[
                      Text(
                        'Networks',
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final network in widget.proposal.supportedNetworks)
                            Chip(
                              label: Text(network.displayName),
                              visualDensity: VisualDensity.compact,
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                    Text(
                      'Share accounts',
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 8),
                    for (final account in _accounts)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _AccountTile(
                          account: account,
                          selected: _selectedAddresses.contains(account.address),
                          onChanged: (v) {
                            setState(() {
                              if (v == true) {
                                _selectedAddresses.add(account.address);
                              } else {
                                _selectedAddresses.remove(account.address);
                              }
                            });
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      label: 'Reject',
                      onPressed: _reject,
                      variant: AppButtonVariant.secondary,
                      icon: const Icon(Icons.close, size: 18),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: AppButton(
                      label: 'Approve',
                      onPressed: _canApprove ? _approve : null,
                      variant: AppButtonVariant.primary,
                      icon: const Icon(Icons.check, size: 18),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DAppAvatar extends StatelessWidget {
  const _DAppAvatar({this.url, required this.name});

  final String? url;
  final String name;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Center(
        child: Text(
          initial,
          style: theme.textTheme.headlineSmall?.copyWith(
            color: theme.colorScheme.onPrimaryContainer,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _NamespaceTile extends StatelessWidget {
  const _NamespaceTile({required this.namespace, required this.required});

  final WcRequiredNamespace namespace;
  final bool required;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AppCard(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    namespace.key.toUpperCase(),
                    style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: required
                        ? theme.colorScheme.errorContainer
                        : theme.colorScheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    required ? 'Required' : 'Optional',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: required
                          ? theme.colorScheme.onErrorContainer
                          : AppColors.muted,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (namespace.methods.isNotEmpty) ...[
              Text('Methods', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.muted)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final m in namespace.methods.take(8))
                    _MethodChip(label: m),
                  if (namespace.methods.length > 8)
                    _MethodChip(label: '+${namespace.methods.length - 8} more'),
                ],
              ),
            ],
            if (namespace.events.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Events', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.muted)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [for (final e in namespace.events) _MethodChip(label: e)],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MethodChip extends StatelessWidget {
  const _MethodChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final display = label.length > 28 ? '${label.substring(0, 28)}…' : label;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        display,
        style: theme.textTheme.labelSmall,
      ),
    );
  }
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.account,
    required this.selected,
    required this.onChanged,
  });

  final WcAccount account;
  final bool selected;
  final ValueChanged<bool?> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Checkbox(
            value: selected,
            onChanged: onChanged,
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _shortAddress(account.address),
                  style: theme.textTheme.bodyMedium?.copyWith(fontFamily: 'monospace'),
                ),
                const SizedBox(height: 2),
                Text(
                  account.network.displayName,
                  style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _shortAddress(String a) {
  if (a.length < 12) return a;
  return '${a.substring(0, 6)}…${a.substring(a.length - 6)}';
}
