import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/foundation.dart';

import 'bootstrap/lazy_firebase.dart';
import 'push_notification_dedup.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint("Handling a background message: ${message.messageId}");
}

void _handleRemoteMessageTap(RemoteMessage message) {
  debugPrint("Notification tapped with payload: ${message.data}");
  // Route user based on message.data here in the future.
}

void _handleLocalNotificationResponse(NotificationResponse response) {
  final payload = response.payload;
  if (payload != null) {
    debugPrint("Local notification tapped with payload: $payload");
    // Route user based on payload here in the future.
  }
}

class PushNotificationService {
  static final PushNotificationService _instance =
      PushNotificationService._internal();
  factory PushNotificationService() => _instance;
  PushNotificationService._internal();

  late final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  /// Bounded dedup window for redelivered messages (#685).
  final PushNotificationDedup _dedup = PushNotificationDedup();

  static bool _backgroundHandlerRegistered = false;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedAppSubscription;
  Future<void>? _initializing;
  Future<void>? _disposing;
  bool _isInitialized = false;

  @visibleForTesting
  int get activeListenerCount =>
      (_foregroundSubscription == null ? 0 : 1) +
      (_openedAppSubscription == null ? 0 : 1);

  Future<void> init() {
    if (_disposing != null) {
      return _disposing!.then((_) => init());
    }
    if (_isInitialized) return Future<void>.value();
    return _initializing ??= _initialize().whenComplete(() {
      _initializing = null;
    });
  }

  Future<void> _initialize() async {
    // Firebase Core is no longer started during app start-up (#684); make sure
    // it exists before the first Firebase plugin call.
    await LazyFirebase.ensureInitialized();

    if (!_backgroundHandlerRegistered) {
      // The background entry point belongs to the isolate, not to an app widget.
      FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler,
      );
      _backgroundHandlerRegistered = true;
    }

    // Initialize local notifications for foreground popups
    const AndroidInitializationSettings androidInitSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const DarwinInitializationSettings iosInitSettings =
        DarwinInitializationSettings();
    const InitializationSettings initSettings = InitializationSettings(
      android: androidInitSettings,
      iOS: iosInitSettings,
    );

    await _localNotificationsPlugin.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _handleLocalNotificationResponse,
    );

    // Create Android notification channel.
    const channel = AndroidNotificationChannel(
      'high_importance_channel',
      'High Importance Notifications',
      description: 'This channel is used for important notifications.',
      importance: Importance.max,
    );

    await _localNotificationsPlugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    try {
      // Keep ownership of both subscriptions so app teardown can cancel them.
      _foregroundSubscription = FirebaseMessaging.onMessage.listen(
        _onForegroundMessage,
      );

      // Handle app opened from terminated state.
      RemoteMessage? initialMessage = await _fcm.getInitialMessage();
      if (initialMessage != null) {
        _onMessageOpened(initialMessage);
      }

      // Handle app opened from background state.
      _openedAppSubscription =
          FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpened);

      // Request permissions.
      await requestPermission();

      _isInitialized = true;
    } catch (_) {
      await _cancelSubscriptions();
      rethrow;
    }
  }

  /// Releases the foreground and tap listeners when the app widget unmounts.
  /// A later [init] can subscribe again without retaining the old callbacks.
  Future<void> dispose() {
    return _disposing ??= _dispose().whenComplete(() {
      _disposing = null;
    });
  }

  Future<void> _dispose() async {
    try {
      await _initializing;
    } catch (_) {
      // Initialization already cancelled any partially registered listeners.
    }
    _isInitialized = false;
    await _cancelSubscriptions();
  }

  Future<void> _cancelSubscriptions() async {
    final foreground = _foregroundSubscription;
    final openedApp = _openedAppSubscription;
    _foregroundSubscription = null;
    _openedAppSubscription = null;
    await Future.wait([
      if (foreground != null) foreground.cancel(),
      if (openedApp != null) openedApp.cancel(),
    ]);
  }

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null || notification.android == null || kIsWeb) return;

    // A stable ID replaces a duplicate delivery in the Android tray.
    final notificationId = _stableIdFromMessageId(message.messageId);
    const channel = AndroidNotificationChannel(
      'high_importance_channel',
      'High Importance Notifications',
      description: 'This channel is used for important notifications.',
      importance: Importance.max,
    );
    unawaited(
      _localNotificationsPlugin.show(
        notificationId,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            channel.id,
            channel.name,
            channelDescription: channel.description,
            icon: '@mipmap/ic_launcher',
          ),
        ),
        payload: message.data.toString(),
      ),
    );
  }

  /// Returns true the first time [message] is delivered and false when it is a
  /// redelivery of a message already seen inside the dedup window.
  ///
  /// Exposed so callers (and tests) can ask whether a delivery is new without
  /// going through the Firebase streams.
  @visibleForTesting
  bool acceptDelivery(RemoteMessage message) =>
      _dedup.markSeen(pushNotificationDedupKey(message));

  /// Ids currently inside the dedup window, oldest first.
  @visibleForTesting
  List<String> get dedupWindow => _dedup.entries;

  /// Empties the dedup window.
  @visibleForTesting
  void resetDedup() => _dedup.clear();

  /// Drops a redelivered foreground message: the tray already shows it (or the
  /// user has dealt with it), so showing it again would only stack a copy.
  void _onForegroundMessage(RemoteMessage message) {
    if (!acceptDelivery(message)) {
      debugPrint('Ignoring redelivered notification ${message.messageId}');
      return;
    }
    _handleForegroundMessage(message);
  }

  /// Drops a redelivered tap: a message can reach the app through both
  /// `getInitialMessage` and `onMessageOpenedApp`, and navigating twice would
  /// leave the user on the wrong screen.
  void _onMessageOpened(RemoteMessage message) {
    if (!acceptDelivery(message)) {
      debugPrint('Ignoring duplicate notification tap ${message.messageId}');
      return;
    }
    _handleRemoteMessageTap(message);
  }

  Future<void> requestPermission() async {
    NotificationSettings settings = await _fcm.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );
    debugPrint('User granted permission: ${settings.authorizationStatus}');
  }

  Future<String?> getToken() async {
    return await _fcm.getToken();
  }

  /// Converts a (possibly null) FCM messageId string into a stable positive
  /// 32-bit integer suitable for use as a `flutter_local_notifications` ID.
  ///
  /// Android's notification manager uses the ID to identify a notification
  /// slot — showing a new notification with the same ID replaces the old one.
  /// Using a deterministic function of the FCM messageId means that if the
  /// same logical notification is delivered more than once (duplicate SSE
  /// event → duplicate FCM dispatch) only one tray entry will ever appear.
  ///
  /// Algorithm: Bernstein djb2-style hash — cheap, collision-resistant enough
  /// for this use case, and pure Dart with no extra dependencies.
  static int _stableIdFromMessageId(String? messageId) {
    if (messageId == null || messageId.isEmpty) {
      // Fallback: no messageId available, use a fixed sentinel so we still
      // avoid showing multiple identical "unknown" alerts.
      return 0;
    }
    int hash = 5381;
    for (final int codeUnit in messageId.codeUnits) {
      // hash = ((hash << 5) + hash) + codeUnit  (i.e. hash * 33 + codeUnit)
      hash = (hash * 33 + codeUnit) & 0x7fffffff; // keep positive 31-bit int
    }
    return hash;
  }

  /// Public alias for [_stableIdFromMessageId], exposed so unit tests can
  /// exercise the hashing logic without a live FCM / Firebase environment.
  @visibleForTesting
  static int stableIdFromMessageId(String? messageId) =>
      _stableIdFromMessageId(messageId);
}
