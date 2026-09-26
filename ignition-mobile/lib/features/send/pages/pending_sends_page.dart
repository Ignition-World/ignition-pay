import 'dart:async';

import 'package:flutter/material.dart';

import '../data/draft_store.dart';
import '../data/transaction_draft.dart';
import '../services/draft_sync_service.dart';

/// Lists queued offline send drafts so the user can review, retry or cancel
/// them (issue #678).
class PendingSendsPage extends StatefulWidget {
  const PendingSendsPage({
    super.key,
    required this.store,
    this.syncService,
  });

  final DraftStore store;

  /// Optional coordinator used for manual retry/cancel. When omitted the page
  /// still lets the user cancel drafts directly in the store.
  final DraftSyncService? syncService;

  @override
  State<PendingSendsPage> createState() => _PendingSendsPageState();
}

class _PendingSendsPageState extends State<PendingSendsPage> {
  List<TransactionDraft> _drafts = const <TransactionDraft>[];
  bool _loading = true;
  StreamSubscription<TransactionDraft>? _changesSubscription;

  @override
  void initState() {
    super.initState();
    _changesSubscription = widget.syncService?.changes.listen((_) => _load());
    unawaited(_load());
  }

  @override
  void dispose() {
    unawaited(_changesSubscription?.cancel());
    super.dispose();
  }

  Future<void> _load() async {
    final drafts = await widget.store.submittable();
    if (!mounted) return;
    setState(() {
      _drafts = drafts;
      _loading = false;
    });
  }

  Future<void> _cancel(TransactionDraft draft) async {
    final syncService = widget.syncService;
    if (syncService != null) {
      await syncService.cancel(draft.id);
    } else {
      await widget.store.updateStatus(
        draft.id,
        DraftStatus.cancelled,
        errorMessage: 'Cancelled by user',
      );
      await _load();
    }
  }

  Future<void> _retry() async {
    await widget.syncService?.submitPending();
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pending sends')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _drafts.isEmpty
              ? const Center(
                  key: Key('pending_sends_empty'),
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No pending sends. Drafts you start offline will appear here.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              : Column(
                  children: [
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: Text(
                        'These payments will be sent automatically when you are back online.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: TextButton(
                          key: const Key('pending_sends_retry_button'),
                          onPressed: _retry,
                          child: const Text('Send now'),
                        ),
                      ),
                    ),
                    Expanded(
                      child: ListView.separated(
                        itemCount: _drafts.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final draft = _drafts[index];
                          return ListTile(
                            key: Key('pending_send_${draft.id}'),
                            title: Text(
                              '${draft.amount} ${draft.asset} to '
                              '${_shorten(draft.recipient)}',
                            ),
                            subtitle: Text(draft.status.wireName),
                            trailing: TextButton(
                              key: Key('cancel_draft_${draft.id}'),
                              onPressed: () => _cancel(draft),
                              child: const Text('Cancel'),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
    );
  }

  static String _shorten(String address) => address.length <= 10
      ? address
      : '${address.substring(0, 4)}…${address.substring(address.length - 4)}';
}
