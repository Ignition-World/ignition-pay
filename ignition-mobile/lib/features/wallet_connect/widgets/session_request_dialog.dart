import 'package:flutter/material.dart';

import '../../../core/design_system/app_button.dart';
import '../../../core/design_system/app_card.dart';
import '../../../core/design_system/app_colors.dart';
import '../models/wc_session_request.dart';
import '../services/wallet_connect_service.dart';

/// Approval dialog shown when a DApp sends a session request (transaction
/// signing, message signing, typed data signing, …).
///
/// Displays the DApp identity, the request type, and either a readable
/// summary of the payload or its raw JSON. The returned future resolves with
/// `true` if the user approved or `false` if rejected.
class SessionRequestDialog extends StatefulWidget {
  const SessionRequestDialog({
    super.key,
    required this.request,
    this.service,
  });

  final WcSessionRequest request;
  final WalletConnectService? service;

  static Future<bool?> show(
    BuildContext context, {
    required WcSessionRequest request,
    WalletConnectService? service,
  }) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => SessionRequestDialog(request: request, service: service),
    );
  }

  @override
  State<SessionRequestDialog> createState() => _SessionRequestDialogState();
}

class _SessionRequestDialogState extends State<SessionRequestDialog> {
  late final WalletConnectService _service =
      widget.service ?? WalletConnectService.instance;
  bool _busy = false;
  bool _showRaw = false;

  bool get _expired => widget.request.isExpired;

  Future<void> _approve() async {
    if (_busy || _expired) return;
    setState(() => _busy = true);
    try {
      // In a production integration the signing pipeline would produce a
      // real signed payload. We return a synthetic result so the service's
      // observable state clears correctly.
      final signed = <String, dynamic>{
        'id': widget.request.id,
        'method': widget.request.method,
        'signed': true,
        'result': widget.request.params.isNotEmpty
            ? {'hash': '0xapproved_${widget.request.id}'}
            : <String, dynamic>{},
      };
      await _service.approveRequest(
        request: widget.request,
        signedPayload: signed,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to approve: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reject() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _service.rejectRequest(widget.request);
      if (mounted) Navigator.of(context).pop(false);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dapp = widget.request.dapp;
    final expired = _expired;
    return AlertDialog(
      scrollable: true,
      titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
      actionsPadding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      title: Row(
        children: [
          _RequestBadge(type: widget.request.type),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.request.type.displayName,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  dapp.name,
                  style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (expired)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'This request has expired.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onErrorContainer,
                  ),
                ),
              ),
            ),
          AppCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _LabelValue(
                  label: 'Network',
                  value: widget.request.network.displayName,
                ),
                const SizedBox(height: 8),
                _LabelValue(
                  label: 'Method',
                  value: widget.request.method,
                  mono: true,
                ),
                const SizedBox(height: 8),
                if (!_showRaw)
                  _LabelValue(
                    label: 'Summary',
                    value: widget.request.readableParams.isEmpty
                        ? 'No parameters'
                        : widget.request.readableParams,
                  )
                else
                  _LabelValue(
                    label: 'Parameters',
                    value: _formatRaw(widget.request.params),
                    mono: true,
                  ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => setState(() => _showRaw = !_showRaw),
                    child: Text(_showRaw ? 'Show summary' : 'View raw'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (widget.request.isTransaction)
            Text(
              'Make sure you understand the action before approving. This cannot be undone.',
              style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
            ),
        ],
      ),
      actions: [
        AppButton(
          label: 'Reject',
          onPressed: _busy || expired ? null : _reject,
          variant: AppButtonVariant.secondary,
          loading: _busy,
        ),
        AppButton(
          label: 'Approve',
          onPressed: _busy || expired ? null : _approve,
          variant: AppButtonVariant.primary,
          loading: _busy,
        ),
      ],
    );
  }
}

class _RequestBadge extends StatelessWidget {
  const _RequestBadge({required this.type});

  final WcRequestType type;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isTx = type == WcRequestType.stellarTransaction ||
        type == WcRequestType.ethTransaction ||
        type == WcRequestType.solanaSignTransaction;
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: isTx
            ? theme.colorScheme.primaryContainer
            : theme.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(
        isTx ? Icons.send : Icons.draw,
        color: isTx
            ? theme.colorScheme.onPrimaryContainer
            : theme.colorScheme.onSurface,
        size: 22,
      ),
    );
  }
}

class _LabelValue extends StatelessWidget {
  const _LabelValue({
    required this.label,
    required this.value,
    this.mono = false,
  });

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(color: AppColors.muted),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: (mono ? theme.textTheme.bodyMedium?.copyWith(fontFamily: 'monospace') : theme.textTheme.bodyMedium)
              ?.copyWith(height: 1.2),
        ),
      ],
    );
  }
}

String _formatRaw(List<dynamic> params) {
  final buf = StringBuffer();
  for (var i = 0; i < params.length; i++) {
    if (i > 0) buf.writeln();
    buf.write('[$i] ');
    final p = params[i];
    final s = p.toString();
    buf.write(s.length > 400 ? '${s.substring(0, 400)}…' : s);
  }
  return buf.toString();
}
