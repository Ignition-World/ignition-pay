import 'package:flutter/material.dart';

import '../../../core/design_system/app_card.dart';
import '../../../core/design_system/app_colors.dart';
import '../models/wc_network.dart';
import '../models/wc_session.dart';

/// List tile summarising a single connected DApp session.
///
/// Shows the DApp avatar, name, host, network badges, TTL, and a trailing
/// disconnect action that invokes the provided callback.
class ConnectedWalletTile extends StatelessWidget {
  const ConnectedWalletTile({
    super.key,
    required this.session,
    this.onDisconnect,
  });

  final WcSession session;
  final VoidCallback? onDisconnect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final networks = _networkSet(session.accounts);
    final ttl = session.remainingDuration;
    final expired = session.isExpired || session.status != WcSessionStatus.approved;
    final initial = session.peer.name.isNotEmpty ? session.peer.name[0].toUpperCase() : '?';
    return AppCard(
      onTap: onDisconnect,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: expired
                  ? theme.colorScheme.surfaceContainerHighest
                  : theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                initial,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: expired
                      ? AppColors.muted
                      : theme.colorScheme.onPrimaryContainer,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        session.peer.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: expired ? AppColors.muted : null,
                        ),
                      ),
                    ),
                    if (expired)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.errorContainer,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          _statusLabel(session.status),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onErrorContainer,
                          ),
                        ),
                      ),
                  ],
                ),
                if (session.peer.displayHost.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    session.peer.displayHost,
                    style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
                  ),
                ],
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    for (final n in networks.take(3))
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          n.displayName,
                          style: theme.textTheme.labelSmall,
                        ),
                      ),
                    if (networks.length > 3)
                      Text(
                        '+${networks.length - 3}',
                        style: theme.textTheme.labelSmall?.copyWith(color: AppColors.muted),
                      ),
                    const SizedBox(width: 4),
                    if (!expired)
                      Text(
                        _ttlLabel(ttl),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: ttl.inHours < 1 ? theme.colorScheme.error : AppColors.muted,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            tooltip: 'Disconnect',
            onPressed: expired ? null : onDisconnect,
            icon: Icon(
              Icons.link_off,
              color: expired ? AppColors.muted : theme.colorScheme.error,
            ),
          ),
        ],
      ),
    );
  }
}

Set<WcNetwork> _networkSet(List<WcAccount> accounts) {
  final set = <WcNetwork>{};
  for (final a in accounts) {
    if (a.network != WcNetwork.unknown) set.add(a.network);
  }
  return set;
}

String _statusLabel(WcSessionStatus status) {
  switch (status) {
    case WcSessionStatus.pending:
      return 'Pending';
    case WcSessionStatus.approved:
      return 'Active';
    case WcSessionStatus.rejected:
      return 'Rejected';
    case WcSessionStatus.expired:
      return 'Expired';
    case WcSessionStatus.disconnected:
      return 'Disconnected';
  }
}

String _ttlLabel(Duration d) {
  if (d.isNegative) return 'expired';
  if (d.inDays >= 1) return '${d.inDays}d remaining';
  if (d.inHours >= 1) return '${d.inHours}h remaining';
  if (d.inMinutes >= 1) return '${d.inMinutes}m remaining';
  return '${d.inSeconds}s remaining';
}
