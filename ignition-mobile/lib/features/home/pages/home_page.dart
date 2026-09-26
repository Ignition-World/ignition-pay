import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

import 'package:ignition_mobile/config/env_config.dart';
import 'package:ignition_mobile/core/network/api_client.dart';
import 'package:ignition_mobile/features/home/models/transaction_status.dart';
import 'package:ignition_mobile/features/home/services/transaction_stream_service.dart';

/// Home page with real-time transaction status updates.
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with WidgetsBindingObserver {
  late final TransactionStreamService _streamService;
  late final FlutterLocalNotificationsPlugin _notifications;
  final List<TransactionModel> _transactions = [];
  final Map<String, TransactionModel> _transactionMap = {};
  TransactionConnectionState _connectionState = TransactionConnectionState.connecting;
  StreamSubscription<List<TransactionModel>>? _transactionsSub;
  StreamSubscription<TransactionConnectionState>? _connectionStateSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeServices();
  }

  Future<void> _initializeServices() async {
    _notifications = FlutterLocalNotificationsPlugin();
    await _initializeNotifications();

    final apiClient = ApiClient();
    apiClient.initialize();

    _streamService = TransactionStreamService(
      apiClient: apiClient,
      envConfig: EnvConfig(),
    );

    _transactionsSub = _streamService.transactionsStream.listen(_onTransactionsUpdate);
    _connectionStateSub = _streamService.connectionStateStream.listen(_onConnectionStateChange);

    await _streamService.initialize();
  }

  Future<void> _initializeNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _notifications.initialize(initSettings);

    // Create notification channel for Android
    const channel = AndroidNotificationChannel(
      'transaction_confirmations',
      'Transaction Confirmations',
      description: 'Notifications for confirmed transactions',
      importance: Importance.high,
    );
    await _notifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  void _onTransactionsUpdate(List<TransactionModel> updates) {
    setState(() {
      for (final transaction in updates) {
        final existing = _transactionMap[transaction.id];
        if (existing != null) {
          final wasPending = existing.status == TransactionStatus.pending;
          final isNowCompleted = transaction.status == TransactionStatus.completed;

          // Show notification when pending transaction confirms
          if (wasPending && isNowCompleted) {
            _showTransactionConfirmedNotification(transaction);
          }
        }

        _transactionMap[transaction.id] = transaction;
      }

      // Update list maintaining order (newest first)
      _transactions
        ..clear()
        ..addAll(_transactionMap.values.toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt)));
    });
  }

  void _onConnectionStateChange(TransactionConnectionState state) {
    setState(() {
      _connectionState = state;
    });
  }

  void _showTransactionConfirmedNotification(TransactionModel transaction) {
    const androidDetails = AndroidNotificationDetails(
      'transaction_confirmations',
      'Transaction Confirmations',
      channelDescription: 'Notifications for confirmed transactions',
      importance: Importance.high,
      priority: Priority.high,
    );
    const iosDetails = DarwinNotificationDetails();
    const details = NotificationDetails(android: androidDetails, iOS: iosDetails);

    _notifications.show(
      transaction.id.hashCode,
      'Transaction Confirmed',
      '${transaction.asset} ${transaction.amount} sent to ${_truncateAddress(transaction.destination)}',
      details,
      payload: transaction.id,
    );
  }

  String _truncateAddress(String address) {
    if (address.length <= 10) return address;
    return '${address.substring(0, 6)}...${address.substring(address.length - 4)}';
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _streamService.onAppForeground();
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        _streamService.onAppBackground();
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _transactionsSub?.cancel();
    _connectionStateSub?.cancel();
    _streamService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ignition Pay'),
        centerTitle: true,
        actions: [
          _ConnectionStatusIndicator(state: _connectionState),
          const SizedBox(width: 16),
        ],
      ),
      body: _transactions.isEmpty
          ? _buildEmptyState()
          : _buildTransactionList(),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/send'),
        tooltip: 'Send Payment',
        child: const Icon(Icons.send),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.receipt_long_outlined,
            size: 80,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            'No transactions yet',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'Your transaction history will appear here',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => context.push('/send'),
            icon: const Icon(Icons.send),
            label: const Text('Send Payment'),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionList() {
    return RefreshIndicator(
      onRefresh: () async {
        // Trigger a manual poll
        await _streamService.pollTransactions();
      },
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _transactions.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final transaction = _transactions[index];
          return _AnimatedTransactionTile(transaction: transaction);
        },
      ),
    );
  }
}

/// Animated transaction tile that smoothly updates on status change.
class _AnimatedTransactionTile extends StatefulWidget {
  const _AnimatedTransactionTile({required this.transaction});

  final TransactionModel transaction;

  @override
  State<_AnimatedTransactionTile> createState() => _AnimatedTransactionTileState();
}

class _AnimatedTransactionTileState extends State<_AnimatedTransactionTile>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 1.05).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );
  }

  @override
  void didUpdateWidget(covariant _AnimatedTransactionTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.transaction.status != widget.transaction.status) {
      _controller.forward().then((_) => _controller.reverse());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color _getStatusColor(TransactionStatus status) {
    switch (status) {
      case TransactionStatus.pending:
        return Colors.orange;
      case TransactionStatus.completed:
        return Colors.green;
      case TransactionStatus.failed:
        return Colors.red;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = _getStatusColor(widget.transaction.status);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: child,
        );
      },
      child: Card(
        elevation: 1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: statusColor.withValues(alpha: 0.3),
            width: 1,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${widget.transaction.asset} ${widget.transaction.amount}',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  _StatusChip(status: widget.transaction.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'To ${widget.transaction.destination}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              if (widget.transaction.memo != null) ...[
                const SizedBox(height: 4),
                Text(
                  'Memo: ${widget.transaction.memo}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    _formatDate(widget.transaction.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  if (widget.transaction.updatedAt != null &&
                      widget.transaction.updatedAt != widget.transaction.createdAt) ...[
                    const SizedBox(width: 8),
                    Text(
                      'Updated: ${_formatDate(widget.transaction.updatedAt!)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays == 0) {
      if (difference.inHours == 0) {
        return '${difference.inMinutes}m ago';
      }
      return '${difference.inHours}h ago';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    } else {
      return '${date.day}/${date.month}/${date.year}';
    }
  }
}

/// Status indicator chip for transaction status.
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final TransactionStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Color color;
    IconData icon;
    String label;

    switch (status) {
      case TransactionStatus.pending:
        color = Colors.orange;
        icon = Icons.hourglass_empty;
        label = 'Pending';
      case TransactionStatus.completed:
        color = Colors.green;
        icon = Icons.check_circle;
        label = 'Completed';
      case TransactionStatus.failed:
        color = Colors.red;
        icon = Icons.cancel;
        label = 'Failed';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Connection status indicator in app bar.
class _ConnectionStatusIndicator extends StatelessWidget {
  const _ConnectionStatusIndicator({required this.state});

  final TransactionConnectionState state;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Color color;
    IconData icon;
    String tooltip;

    switch (state) {
      case TransactionConnectionState.connecting:
        color = theme.colorScheme.onSurfaceVariant;
        icon = Icons.wifi_tethering;
        tooltip = 'Connecting...';
      case TransactionConnectionState.connected:
        color = Colors.green;
        icon = Icons.wifi;
        tooltip = 'Live updates';
      case TransactionConnectionState.polling:
        color = theme.colorScheme.primary;
        icon = Icons.sync;
        tooltip = 'Polling for updates';
      case TransactionConnectionState.reconnecting:
        color = Colors.orange;
        icon = Icons.wifi_find;
        tooltip = 'Reconnecting...';
      case TransactionConnectionState.paused:
        color = theme.colorScheme.onSurfaceVariant;
        icon = Icons.pause_circle;
        tooltip = 'Paused (background)';
      case TransactionConnectionState.error:
        color = Colors.red;
        icon = Icons.wifi_off;
        tooltip = 'Connection error';
    }

    return Tooltip(
      message: tooltip,
      child: Icon(icon, color: color, size: 20),
    );
  }
}