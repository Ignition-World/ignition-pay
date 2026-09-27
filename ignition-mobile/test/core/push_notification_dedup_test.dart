import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/push_notification_dedup.dart';

void main() {
  group('PushNotificationDedup', () {
    test('the first delivery of an id is new', () {
      final dedup = PushNotificationDedup();

      expect(dedup.markSeen('a'), isTrue);
      expect(dedup.size, 1);
    });

    test('a redelivery of the same id is rejected', () {
      final dedup = PushNotificationDedup()..markSeen('a');

      expect(dedup.markSeen('a'), isFalse);
      expect(dedup.size, 1);
    });

    test('different ids are each accepted once', () {
      final dedup = PushNotificationDedup();

      expect(dedup.markSeen('a'), isTrue);
      expect(dedup.markSeen('b'), isTrue);
      expect(dedup.markSeen('a'), isFalse);
      expect(dedup.size, 2);
    });

    test('contains reports the current window', () {
      final dedup = PushNotificationDedup()..markSeen('a');

      expect(dedup.contains('a'), isTrue);
      expect(dedup.contains('b'), isFalse);
    });

    group('bounded window', () {
      test('retains the last 100 events by default', () {
        final dedup = PushNotificationDedup();
        expect(dedup.capacity, 100);

        for (var i = 0; i < 100; i++) {
          dedup.markSeen('id-$i');
        }

        expect(dedup.size, 100);
        expect(dedup.contains('id-0'), isTrue);
        expect(dedup.contains('id-99'), isTrue);
      });

      test('forgets the oldest id once the window is full', () {
        final dedup = PushNotificationDedup();
        for (var i = 0; i < 100; i++) {
          dedup.markSeen('id-$i');
        }

        dedup.markSeen('id-100');

        expect(dedup.size, 100);
        expect(dedup.contains('id-0'), isFalse);
        expect(dedup.contains('id-1'), isTrue);
        expect(dedup.contains('id-100'), isTrue);
      });

      test('an evicted id is accepted again if it is redelivered later', () {
        final dedup = PushNotificationDedup();
        for (var i = 0; i < 100; i++) {
          dedup.markSeen('id-$i');
        }
        dedup.markSeen('id-100');

        // The window has moved on, so the old id is treated as new again
        // rather than silently suppressed forever.
        expect(dedup.markSeen('id-0'), isTrue);
        expect(dedup.size, 100);
      });

      test('entries are ordered oldest first', () {
        final dedup = PushNotificationDedup(capacity: 3);
        dedup.markSeen('a');
        dedup.markSeen('b');
        dedup.markSeen('c');
        dedup.markSeen('d');

        expect(dedup.entries, ['b', 'c', 'd']);
      });

      test('honours a custom capacity', () {
        final dedup = PushNotificationDedup(capacity: 2);
        dedup.markSeen('a');
        dedup.markSeen('b');
        dedup.markSeen('c');

        expect(dedup.entries, ['b', 'c']);
      });

      test('a capacity of one keeps only the latest id', () {
        final dedup = PushNotificationDedup(capacity: 1);
        dedup.markSeen('a');

        expect(dedup.markSeen('a'), isFalse);
        expect(dedup.markSeen('b'), isTrue);
        expect(dedup.entries, ['b']);
      });
    });

    test('clear empties the window', () {
      final dedup = PushNotificationDedup()..markSeen('a');

      dedup.clear();

      expect(dedup.size, 0);
      expect(dedup.contains('a'), isFalse);
      expect(dedup.markSeen('a'), isTrue);
    });

    test('a fresh instance starts empty, so dedup resets on app restart', () {
      final beforeRestart = PushNotificationDedup()..markSeen('a');
      expect(beforeRestart.contains('a'), isTrue);

      // Nothing is persisted: a new instance is a new process.
      final afterRestart = PushNotificationDedup();
      expect(afterRestart.size, 0);
      expect(afterRestart.markSeen('a'), isTrue);
    });
  });

  group('pushNotificationDedupKey', () {
    test('prefers the FCM messageId', () {
      final key = pushNotificationDedupKey(
        const RemoteMessage(messageId: 'msg-1'),
      );

      expect(key, 'id:msg-1');
    });

    test('two messages with different ids get different keys', () {
      final a = pushNotificationDedupKey(
        const RemoteMessage(messageId: 'msg-1'),
      );
      final b = pushNotificationDedupKey(
        const RemoteMessage(messageId: 'msg-2'),
      );

      expect(a, isNot(b));
    });

    test('falls back to content when there is no messageId', () {
      final message = RemoteMessage(
        sentTime: DateTime.utc(2026, 9, 26, 12),
        notification: const RemoteNotification(
          title: 'Payment received',
          body: 'You received 10 USDC',
        ),
      );

      final key = pushNotificationDedupKey(message);

      expect(key, startsWith('content:'));
      expect(key, contains('Payment received'));
    });

    test('the same content without a messageId produces the same key', () {
      RemoteMessage build() => RemoteMessage(
            sentTime: DateTime.utc(2026, 9, 26, 12),
            notification: const RemoteNotification(
              title: 'Payment received',
              body: 'You received 10 USDC',
            ),
            data: const {'type': 'payment'},
          );

      expect(pushNotificationDedupKey(build()),
          pushNotificationDedupKey(build()));
    });

    test('different content without a messageId produces different keys', () {
      RemoteMessage build(String title) => RemoteMessage(
            sentTime: DateTime.utc(2026, 9, 26, 12),
            notification: RemoteNotification(title: title, body: 'body'),
          );

      expect(
        pushNotificationDedupKey(build('First')),
        isNot(pushNotificationDedupKey(build('Second'))),
      );
    });

    test('an empty message still gets a stable key', () {
      expect(pushNotificationDedupKey(const RemoteMessage()),
          pushNotificationDedupKey(const RemoteMessage()));
    });
  });

  group('fuzz', () {
    test('10,000 unique messages leave the window bounded', () {
      final dedup = PushNotificationDedup();

      for (var i = 0; i < 10000; i++) {
        expect(
          dedup.markSeen('msg-$i'),
          isTrue,
          reason: 'a fresh id must always be accepted (i=$i)',
        );
        expect(dedup.size, lessThanOrEqualTo(dedup.capacity));
      }

      expect(dedup.size, dedup.capacity);
      expect(dedup.contains('msg-0'), isFalse);
      expect(dedup.contains('msg-9999'), isTrue);
      expect(dedup.entries, hasLength(dedup.capacity));
    });

    test('10,000 redeliveries of the same message are accepted once', () {
      final dedup = PushNotificationDedup();
      var accepted = 0;

      for (var i = 0; i < 10000; i++) {
        if (dedup.markSeen('msg-1')) accepted++;
      }

      expect(accepted, 1);
      expect(dedup.size, 1);
    });

    test('10,000 mixed deliveries never exceed the window', () {
      final dedup = PushNotificationDedup(capacity: 100);

      for (var i = 0; i < 10000; i++) {
        // Every third delivery repeats an id that is already in the window.
        final id = i % 3 == 0 ? 'msg-${i % 50}' : 'msg-$i';
        dedup.markSeen(id);
        expect(dedup.size, lessThanOrEqualTo(dedup.capacity));
      }

      expect(dedup.size, dedup.capacity);
    });

    test('10,000 empty keys do not corrupt the window', () {
      final dedup = PushNotificationDedup();
      var accepted = 0;

      for (var i = 0; i < 10000; i++) {
        if (dedup.markSeen('')) accepted++;
      }

      expect(accepted, 1);
      expect(dedup.size, 1);
    });
  });
}
