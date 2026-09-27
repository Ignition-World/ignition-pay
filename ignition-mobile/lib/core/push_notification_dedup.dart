import 'package:firebase_messaging/firebase_messaging.dart';

/// Bounded, in-memory de-duplication of delivered push notifications (#685).
///
/// FCM does not guarantee exactly-once delivery: a phone that loses signal
/// mid-push, or a user who force-quits and reopens the app, can receive the
/// same message again. Without de-duplication the tray fills with copies of the
/// same alert and a tap can fire the same navigation twice.
///
/// Design constraints, from the issue:
///
/// * **Bounded.** At most [capacity] ids are retained in a circular buffer, so
///   memory use does not grow with the number of messages ever received.
/// * **In memory only.** The window is intentionally empty after a restart:
///   re-opening the app must not suppress genuinely new notifications, and
///   nothing here touches disk or shared preferences.
/// * **O(1).** Both the membership check and the insert are constant time.
class PushNotificationDedup {
  PushNotificationDedup({this.capacity = defaultCapacity})
      : assert(capacity > 0, 'capacity must be greater than zero'),
        _buffer = List<String?>.filled(capacity, null);

  /// Number of ids remembered by default.
  static const int defaultCapacity = 100;

  /// Maximum number of ids retained. The oldest id is forgotten first.
  final int capacity;

  final List<String?> _buffer;

  /// Mirror of [_buffer] for O(1) membership checks, kept in sync on insert
  /// and eviction so it never holds more than [capacity] entries.
  final Set<String> _seen = <String>{};

  int _start = 0;
  int _count = 0;

  /// Number of ids currently remembered. Never exceeds [capacity].
  int get size => _count;

  /// True when [id] is inside the dedup window.
  bool contains(String id) => _seen.contains(id);

  /// Records [id] and reports whether this is the first delivery.
  ///
  /// Returns true for a new message and false for a redelivery of one already
  /// seen inside the window — the caller should then do nothing, because
  /// re-delivering the same notification would stack a duplicate in the tray.
  bool markSeen(String id) {
    if (_seen.contains(id)) return false;

    final writeAt = (_start + _count) % capacity;
    if (_count == capacity) {
      // The buffer is full: the slot being overwritten is the oldest id.
      _seen.remove(_buffer[writeAt]);
      _start = (_start + 1) % capacity;
    } else {
      _count++;
    }

    _buffer[writeAt] = id;
    _seen.add(id);
    return true;
  }

  /// Empties the window. A new app instance starts empty, so this is only
  /// needed by tests and by an explicit user-facing reset.
  void clear() {
    _buffer.fillRange(0, capacity, null);
    _seen.clear();
    _start = 0;
    _count = 0;
  }

  /// Ids in the window, oldest first. Used by the service's test seam and by
  /// the dedup tests.
  List<String> get entries {
    return <String>[
      for (var offset = 0; offset < _count; offset++)
        _buffer[(_start + offset) % capacity]!,
    ];
  }
}

/// Builds the dedup key for [message].
///
/// `messageId` is used whenever FCM supplies one. Data-only messages can arrive
/// without it, so the key then falls back to the content that identifies the
/// notification: the send time plus title, body and data payload. A redelivery
/// of the same payload produces the same key, while two genuinely different
/// messages do not.
String pushNotificationDedupKey(RemoteMessage message) {
  final messageId = message.messageId;
  if (messageId != null && messageId.isNotEmpty) return 'id:$messageId';

  final notification = message.notification;
  return 'content:${message.sentTime?.microsecondsSinceEpoch ?? 0}'
      '|${notification?.title ?? ''}'
      '|${notification?.body ?? ''}'
      '|${message.data}';
}
