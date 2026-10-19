import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../data/transaction_draft.dart';

/// Surfaces offline-draft lifecycle events to the user.
///
/// Abstracted so sync logic can be unit-tested with a recording fake.
abstract class DraftNotifier {
  /// A queued draft was broadcast successfully.
  Future<void> draftSent(TransactionDraft draft);

  /// A queued draft was cancelled (by the user or because it expired).
  Future<void> draftCancelled(TransactionDraft draft);

  /// A submission attempt failed and the draft remains queued.
  Future<void> draftFailed(TransactionDraft draft);
}

/// [DraftNotifier] backed by `flutter_local_notifications`.
class LocalDraftNotifier implements DraftNotifier {
  LocalDraftNotifier({FlutterLocalNotificationsPlugin? plugin})
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const String _channelId = 'send_drafts';
  static const String _channelName = 'Pending sends';
  static const String _channelDescription =
      'Offline send draft updates';

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    );
    await _plugin.initialize(settings);
    _initialized = true;
  }

  Future<void> _show(String title, String body, int idSeed) async {
    if (kIsWeb) return;
    try {
      await _ensureInitialized();
      const details = NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: _channelDescription,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      );
      await _plugin.show(idSeed & 0x7fffffff, title, body, details);
    } catch (error) {
      // Notifications are best-effort — never let them break submission.
      debugPrint('Failed to show draft notification: $error');
    }
  }

  @override
  Future<void> draftSent(TransactionDraft draft) => _show(
        'Payment sent',
        'Your queued payment of ${draft.amount} ${draft.asset} was sent.',
        draft.id.hashCode,
      );

  @override
  Future<void> draftCancelled(TransactionDraft draft) => _show(
        'Queued payment cancelled',
        'A queued payment of ${draft.amount} ${draft.asset} was cancelled.',
        draft.id.hashCode ^ 0x5f5f,
      );

  @override
  Future<void> draftFailed(TransactionDraft draft) => _show(
        'Payment still pending',
        'We could not send ${draft.amount} ${draft.asset} yet. '
            'We will retry automatically.',
        draft.id.hashCode ^ 0x2b2b,
      );
}
