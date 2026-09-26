import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/analytics_service.dart';

void main() {
  late List<String> events;
  late List<String?> userIds;
  late AnalyticsService service;

  setUp(() {
    events = <String>[];
    userIds = <String?>[];
    service = AnalyticsService(
      sender: (name, parameters) async =>
          events.add('$name:${parameters?['asset_code']}'),
      setUserId: (id) async => userIds.add(id),
    );
  });

  group('before the app is interactive', () {
    test('events are queued, not sent', () async {
      await service.logReceiveViewed();

      expect(events, isEmpty);
      expect(service.pendingCallCount, 1);
      expect(service.isInteractive, isFalse);
    });

    test('the user id is queued too', () async {
      await service.setUserId('user-1');

      expect(userIds, isEmpty);
      expect(service.pendingCallCount, 1);
    });

    test('queued calls are flushed in order once interactive', () async {
      await service.logWalletConnect('GA1234567890');
      await service.setUserId('user-1');
      await service.logReceiveViewed();

      await service.markTimeToInteractive();

      expect(events, ['wallet_connect:null', 'receive_viewed:null']);
      expect(userIds, ['user-1']);
      expect(service.pendingCallCount, 0);
    });

    test('flushing twice does not re-send', () async {
      await service.logReceiveViewed();

      await service.markTimeToInteractive();
      await service.markTimeToInteractive();

      expect(events, ['receive_viewed:null']);
    });
  });

  group('after the app is interactive', () {
    test('events are sent immediately', () async {
      await service.markTimeToInteractive();

      await service.logSendInitiated(assetCode: 'XLM', amount: 5);

      expect(events, ['send_initiated:XLM']);
      expect(service.pendingCallCount, 0);
    });

    test('parameters are forwarded', () async {
      await service.markTimeToInteractive();

      await service.logAnchorDepositStarted('example.com');

      expect(events.single, contains('anchor_deposit_started'));
    });

    test('the user id is sent immediately', () async {
      await service.markTimeToInteractive();

      await service.setUserId('user-2');

      expect(userIds, ['user-2']);
    });
  });
}
