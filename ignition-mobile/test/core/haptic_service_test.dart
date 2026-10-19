import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/haptic_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  TestDefaultBinaryMessenger messenger() =>
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  late List<MethodCall> platformCalls;
  late HapticService service;

  setUp(() {
    platformCalls = <MethodCall>[];
    service = HapticService();
    messenger().setMockMethodCallHandler(SystemChannels.platform, (call) async {
      platformCalls.add(call);
      return null;
    });
  });

  tearDown(() {
    messenger().setMockMethodCallHandler(SystemChannels.platform, null);
  });

  group('HapticService', () {
    test('lightImpact uses the Flutter SDK light-impact primitive', () async {
      await service.lightImpact();
      expect(platformCalls, hasLength(1));
      expect(platformCalls.single.method, 'HapticFeedback.vibrate');
      expect(platformCalls.single.arguments, 'HapticFeedbackType.lightImpact');
    });

    test('mediumImpact uses the Flutter SDK medium-impact primitive', () async {
      await service.mediumImpact();
      expect(platformCalls.single.method, 'HapticFeedback.vibrate');
      expect(platformCalls.single.arguments, 'HapticFeedbackType.mediumImpact');
    });

    test('heavyImpact uses the Flutter SDK heavy-impact primitive', () async {
      await service.heavyImpact();
      expect(platformCalls.single.method, 'HapticFeedback.vibrate');
      expect(platformCalls.single.arguments, 'HapticFeedbackType.heavyImpact');
    });

    test('selectionClick uses the Flutter SDK selection primitive', () async {
      await service.selectionClick();
      expect(platformCalls.single.method, 'HapticFeedback.vibrate');
      expect(
        platformCalls.single.arguments,
        'HapticFeedbackType.selectionClick',
      );
    });

    test('trigger dispatches each HapticType to its SDK primitive', () async {
      await service.trigger(HapticType.light);
      await service.trigger(HapticType.medium);
      await service.trigger(HapticType.heavy);
      await service.trigger(HapticType.selection);

      expect(
        platformCalls.map((c) => c.arguments).toList(),
        [
          'HapticFeedbackType.lightImpact',
          'HapticFeedbackType.mediumImpact',
          'HapticFeedbackType.heavyImpact',
          'HapticFeedbackType.selectionClick',
        ],
      );
    });

    test('no-ops when disabled (in-app preference respected)', () async {
      service.enabled = false;
      expect(service.isEnabled, isFalse);

      await service.lightImpact();
      await service.mediumImpact();
      await service.heavyImpact();
      await service.selectionClick();

      expect(platformCalls, isEmpty);
    });

    test('resumes after being re-enabled', () async {
      service.enabled = false;
      await service.lightImpact();
      service.enabled = true;
      await service.lightImpact();
      expect(platformCalls, hasLength(1));
    });

    test('degrades gracefully when no haptic engine is available', () async {
      messenger().setMockMethodCallHandler(SystemChannels.platform, (call) async {
        throw MissingPluginException('No haptic engine');
      });

      await expectLater(service.heavyImpact(), completes);
    });

    test('exposes a default shared instance', () {
      expect(HapticService.instance.isEnabled, isTrue);
    });
  });
}
