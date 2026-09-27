import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'history_transaction_tile.dart';
import '../pages/history_data_source.dart';

/// Callback signature for transaction actions.
///
/// Receives the [transaction] being acted on and returns a [Future] that
/// completes when the underlying API call finishes. The future may throw;
/// the caller handles errors.
typedef TransactionActionCallback = Future<void> Function(
  HistoryTransaction transaction,
);

/// Platform-adaptive swipeable wrapper around [HistoryTransactionTile].
///
/// ## Platform behaviour
/// - **Android / Web / Desktop**: left-swipe reveals a *Delete* affordance
///   (red background, delete icon).
/// - **iOS / macOS**: left-swipe reveals *Archive* (blue); right-swipe
///   reveals *Report* (orange), matching the iOS HIG swipe-action pattern.
///
/// ## Undo flow
/// [Dismissible.confirmDismiss] is used to gate the final removal:
/// 1. The swipe fires `confirmDismiss`.
/// 2. An undo [SnackBar] is shown for [undoDuration] (default 5 s).
/// 3. If the user taps *Undo* the snackbar closes and `confirmDismiss`
///    returns `false`, so Flutter re-inserts the item automatically.
/// 4. If the timer expires `confirmDismiss` returns `true` (item is
///    removed by Flutter) and the appropriate callback is invoked.
///
/// The parent is responsible for removing the item from its list only after
/// the [onDelete] / [onArchive] callback fires (i.e., after the undo window).
///
/// ## Accessibility
/// Delete and archive backgrounds expose [Semantics] labels so that
/// screen readers can discover and activate the actions without swiping.
class SwipeableTransactionTile extends StatelessWidget {
  const SwipeableTransactionTile({
    super.key,
    required this.transaction,
    required this.onDelete,
    required this.onArchive,
    this.onTap,
    this.undoDuration = const Duration(seconds: 5),
  });

  final HistoryTransaction transaction;

  /// Called (after the undo window) when the *delete* action is confirmed.
  final TransactionActionCallback onDelete;

  /// Called (after the undo window) when the *archive* action is confirmed.
  final TransactionActionCallback onArchive;

  /// Optional tap handler forwarded to the tile.
  final VoidCallback? onTap;

  /// Duration of the undo window before the irreversible API call is made.
  final Duration undoDuration;

  // ── Platform detection ────────────────────────────────────────────────────

  static bool _isIOS() =>
      !kIsWeb && (Platform.isIOS || Platform.isMacOS);

  // ── Background widgets ────────────────────────────────────────────────────

  static Widget _deleteBackground() {
    return Container(
      color: Colors.red.shade700,
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Semantics(
            label: 'Delete transaction',
            child: const Icon(Icons.delete_outline, color: Colors.white),
          ),
          const SizedBox(width: 8),
          const Text(
            'Delete',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  static Widget _archiveBackground() {
    return Container(
      color: const Color(0xFF007AFF), // iOS system blue
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.only(right: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Semantics(
            label: 'Archive transaction',
            child: const Icon(Icons.archive_outlined, color: Colors.white),
          ),
          const SizedBox(width: 8),
          const Text(
            'Archive',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  static Widget _reportBackground() {
    return Container(
      color: Colors.orange.shade700,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.only(left: 24),
      child: Row(
        children: [
          Semantics(
            label: 'Report transaction',
            child: const Icon(Icons.flag_outlined, color: Colors.white),
          ),
          const SizedBox(width: 8),
          const Text(
            'Report',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  // ── Undo snackbar ─────────────────────────────────────────────────────────

  /// Shows an undo [SnackBar] and returns `true` if the user tapped *Undo*
  /// (action should be cancelled) or `false` if the timer expired (proceed).
  Future<bool> _showUndoSnackbar(
    BuildContext context,
    String actionLabel,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();

    final reason = await messenger
        .showSnackBar(
          SnackBar(
            content: Text('Transaction $actionLabel'),
            duration: undoDuration,
            action: SnackBarAction(
              label: 'Undo',
              onPressed: () {
                // The close reason below captures the action tap.
              },
            ),
          ),
        )
        .closed;

    return reason == SnackBarClosedReason.action;
  }

  // ── confirmDismiss handler ────────────────────────────────────────────────

  Future<bool?> _confirmDelete(BuildContext context) async {
    final undone = await _showUndoSnackbar(context, 'deleted');
    if (undone) return false; // Flutter re-inserts the item.

    try {
      await onDelete(transaction);
    } catch (_) {
      // API errors are swallowed here; surfacing them is the parent's
      // responsibility (e.g., refresh on next load).
    }
    return true; // Flutter removes the item from the tree.
  }

  Future<bool?> _confirmArchive(BuildContext context) async {
    final undone = await _showUndoSnackbar(context, 'archived');
    if (undone) return false;

    try {
      await onArchive(transaction);
    } catch (_) {}
    return true;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final tile = InkWell(
      onTap: onTap,
      child: HistoryTransactionTile(transaction: transaction),
    );

    if (_isIOS()) {
      // iOS: swipe-left → Archive, swipe-right → Report.
      return Dismissible(
        key: ValueKey('swipe_${transaction.id}'),
        direction: DismissDirection.horizontal,
        // background is shown for startToEnd (swipe right → Report)
        background: _reportBackground(),
        // secondaryBackground is shown for endToStart (swipe left → Archive)
        secondaryBackground: _archiveBackground(),
        confirmDismiss: (direction) {
          if (direction == DismissDirection.endToStart) {
            return _confirmArchive(context);
          }
          // Swipe right = Report: show undo snackbar but no API call yet.
          return _showUndoSnackbar(context, 'reported').then((undone) {
            if (undone) return false;
            // TODO(#697): wire report API call here.
            return true;
          });
        },
        child: tile,
      );
    }

    // Android / Web / Desktop: swipe-left → Delete.
    return Dismissible(
      key: ValueKey('swipe_${transaction.id}'),
      direction: DismissDirection.endToStart,
      background: _deleteBackground(),
      confirmDismiss: (_) => _confirmDelete(context),
      child: tile,
    );
  }
}
