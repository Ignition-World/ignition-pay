import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/bootstrap/env_loader.dart';

void main() {
  group('parseDotEnv', () {
    test('parses simple assignments', () {
      final parsed = parseDotEnv('API_BASE_URL=https://api.test\nFLAG=true');

      expect(parsed['API_BASE_URL'], 'https://api.test');
      expect(parsed['FLAG'], 'true');
    });

    test('strips quotes and comments', () {
      final parsed = parseDotEnv('# a comment\nA="quoted"\nB=\'single\'');

      expect(parsed['A'], 'quoted');
      expect(parsed['B'], 'single');
    });

    test('ignores blank lines', () {
      expect(parseDotEnv('\n\nA=1\n\n'), <String, String>{'A': '1'});
    });
  });

  group('EnvLoader.load', () {
    setUp(EnvLoader.resetForTesting);

    test('publishes parsed values into dotenv', () async {
      final result = await EnvLoader.load(
        readAsset: (_) async => 'API_BASE_URL=https://api.test\nFLAG=true',
      );

      expect(dotenv.env['API_BASE_URL'], 'https://api.test');
      expect(dotenv.env['FLAG'], 'true');
      expect(result.entries, containsPair('API_BASE_URL', 'https://api.test'));
      expect(EnvLoader.isLoaded, isTrue);
    });

    test('parses off the UI isolate on non-web platforms', () async {
      final result = await EnvLoader.load(
        readAsset: (_) async => 'A=1',
      );

      // The parse must not run inline: that was the whole point of #684.
      expect(result.usedBackgroundIsolate, isNot(kIsWeb));
    });

    test('is not loaded again once it has run', () async {
      await EnvLoader.load(readAsset: (_) async => 'A=1');
      expect(EnvLoader.isLoaded, isTrue);

      EnvLoader.resetForTesting();
      expect(EnvLoader.isLoaded, isFalse);
    });
  });
}
