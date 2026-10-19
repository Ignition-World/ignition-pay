import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/push_notification_service.dart';

void main() {
  group('PushNotificationService', () {
    test('should be a singleton instance', () {
      final instance1 = PushNotificationService();
      final instance2 = PushNotificationService();

      expect(identical(instance1, instance2), isTrue);
    });

    test('dispose is safe before initialization and on repeated calls', () async {
      final service = PushNotificationService();

      await Future.wait([service.dispose(), service.dispose()]);

      expect(service.activeListenerCount, 0);
    });
  });

  group('_stableIdFromMessageId()', () {
    // Access the private static helper through the public static alias exposed
    // for testing.  The method is static so we can call it without a live
    // Firebase / FCM environment.

    test('returns the same ID for the same messageId', () {
      const messageId = 'projects/ignition/messages/abc123';
      final id1 = PushNotificationService.stableIdFromMessageId(messageId);
      final id2 = PushNotificationService.stableIdFromMessageId(messageId);

      expect(id1, equals(id2));
    });

    test('returns different IDs for different messageIds', () {
      final id1 = PushNotificationService.stableIdFromMessageId('msg-1');
      final id2 = PushNotificationService.stableIdFromMessageId('msg-2');

      expect(id1, isNot(equals(id2)));
    });

    test('returns a non-negative integer (valid Android notification ID)', () {
      final id = PushNotificationService.stableIdFromMessageId(
          'projects/ignition/messages/xyz');

      expect(id, greaterThanOrEqualTo(0));
    });

    test('returns 0 for a null messageId', () {
      expect(PushNotificationService.stableIdFromMessageId(null), equals(0));
    });

    test('returns 0 for an empty messageId', () {
      expect(PushNotificationService.stableIdFromMessageId(''), equals(0));
    });

    test('stays within 31-bit positive range (does not overflow to negative)', () {
      // Exercise with a long string to verify the masking holds.
      const longId = 'a-very-long-firebase-message-id-that-could-cause-overflow'
          '-if-the-hash-is-not-masked-correctly';
      final id = PushNotificationService.stableIdFromMessageId(longId);

      expect(id, greaterThanOrEqualTo(0));
      expect(id, lessThanOrEqualTo(0x7fffffff));
    });
  });
}
