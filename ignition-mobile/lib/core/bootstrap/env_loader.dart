import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Parses raw `.env` text into key/value pairs.
///
/// Pure and top-level so it can be handed to [compute] and run in a background
/// isolate. Keeping it free of Flutter imports is what makes that possible.
Map<String, String> parseDotEnv(String raw) =>
    const Parser().parse(raw.split('\n'));

/// Reads the raw text of a bundled asset. Injected by tests, because
/// `rootBundle` is unavailable in `flutter test`.
typedef AssetTextReader = Future<String> Function(String fileName);

/// Outcome of an [EnvLoader.load] call.
class EnvLoadResult {
  const EnvLoadResult({
    required this.entries,
    required this.parseDuration,
    required this.usedBackgroundIsolate,
  });

  final Map<String, String> entries;

  /// Wall-clock time spent parsing, off the UI isolate.
  final Duration parseDuration;

  /// False on web, where isolates are not available and parsing runs inline.
  final bool usedBackgroundIsolate;
}

/// Loads `.env` into `dotenv.env` without holding up the first frame (#684).
///
/// The asset read itself has to stay on the UI isolate — `rootBundle` is a
/// platform channel — but the parse, which is the part that grows with the
/// file, runs in a background isolate. The parsed map is then published into
/// `dotenv` directly, so the UI isolate never re-parses.
class EnvLoader {
  const EnvLoader._();

  static bool _loaded = false;

  /// True once [load] has completed successfully.
  static bool get isLoaded => _loaded;

  /// Reads `fileName` from the asset bundle and publishes it into `dotenv`.
  static Future<EnvLoadResult> load({
    String fileName = '.env',
    AssetTextReader readAsset = _readFromBundle,
  }) async {
    final raw = await readAsset(fileName);

    final stopwatch = Stopwatch()..start();
    final Map<String, String> entries;
    final bool usedBackgroundIsolate;
    if (kIsWeb) {
      // No isolates on web; the file is parsed inline.
      entries = parseDotEnv(raw);
      usedBackgroundIsolate = false;
    } else {
      entries = await compute(parseDotEnv, raw);
      usedBackgroundIsolate = true;
    }
    stopwatch.stop();

    // `DotEnv` exposes no setter for a pre-parsed map, so it is marked
    // initialised with an empty input and then filled in place. This keeps the
    // already-parsed values instead of parsing `raw` a second time here.
    dotenv.testLoad(fileInput: '');
    dotenv.env.addAll(entries);
    _loaded = true;

    return EnvLoadResult(
      entries: entries,
      parseDuration: stopwatch.elapsed,
      usedBackgroundIsolate: usedBackgroundIsolate,
    );
  }

  static Future<String> _readFromBundle(String fileName) =>
      rootBundle.loadString(fileName);

  /// Test seam: forget that a load happened.
  @visibleForTesting
  static void resetForTesting() {
    _loaded = false;
    dotenv.clean();
  }
}
