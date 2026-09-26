import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/bootstrap/app_bootstrap.dart';

/// Records the order in which the start-up hooks ran.
class _Recorder {
  final List<String> calls = <String>[];

  void record(String name) => calls.add(name);
}

void main() {
  late _Recorder recorder;
  late List<String> failures;

  AppBootstrap build({String? failOn}) {
    Future<void> maybeFail(String phase, Future<void> Function() body) async {
      if (failOn == phase) throw StateError('$phase exploded');
      await body();
    }

    void maybeFailSync(String phase, void Function() body) {
      if (failOn == phase) throw StateError('$phase exploded');
      body();
    }

    return AppBootstrap(
      loadEnv: () => maybeFail('environment', () async => recorder.record('environment')),
      initializeApiClient: () => maybeFailSync('apiClient', () => recorder.record('apiClient')),
      initializeFirebase: () => maybeFail('deferred.firebase', () async => recorder.record('firebase')),
      initializePushNotifications: () => maybeFail('deferred.pushNotifications', () async => recorder.record('push')),
      startDraftSync: () => maybeFail('deferred.draftSync', () async => recorder.record('draftSync')),
      registerDeepLinks: () => maybeFail('deferred.deepLinks', () async => recorder.record('deepLinks')),
      initializeMonitoring: () => maybeFail('monitoring', () async => recorder.record('monitoring')),
      flushAnalytics: () => maybeFail('analytics', () async => recorder.record('analytics')),
      log: (message) => failures.add(message),
    );
  }

  setUp(() {
    recorder = _Recorder();
    failures = <String>[];
  });

  test('the critical path only loads the environment and the API client',
      () async {
    final bootstrap = build();

    await bootstrap.runCriticalPath();

    expect(recorder.calls, ['environment', 'apiClient']);
    expect(bootstrap.completedPhases, ['environment', 'apiClient']);
  });

  test('deferred work runs Firebase before push notifications', () async {
    final bootstrap = build();

    await bootstrap.runDeferred();

    expect(recorder.calls[0], 'firebase');
    expect(recorder.calls[1], 'push');
    expect(recorder.calls, containsAll(<String>['draftSync', 'deepLinks']));
  });

  test('deferred work never touches monitoring or analytics', () async {
    final bootstrap = build();

    await bootstrap.runDeferred();

    expect(recorder.calls, isNot(contains('monitoring')));
    expect(recorder.calls, isNot(contains('analytics')));
  });

  test('monitoring runs before the analytics flush', () async {
    final bootstrap = build();

    await bootstrap.runAfterFirstFrame();

    expect(recorder.calls, ['monitoring', 'analytics']);
  });

  test('a failure in the critical path is logged and the phase recorded',
      () async {
    final bootstrap = build(failOn: 'environment');

    await bootstrap.runCriticalPath();

    expect(bootstrap.completedPhases, contains('environment'));
    expect(failures.first, contains('environment failed'));
    // The rest of the critical path still runs: the home screen must not be
    // held hostage by a broken .env.
    expect(recorder.calls, contains('apiClient'));
  });

  test('a failure in the deferred path does not stop the next step', () async {
    final bootstrap = build(failOn: 'deferred.firebase');

    await bootstrap.runDeferred();

    // Push, draft sync and deep links still ran: a Firebase failure must not
    // take the rest of start-up with it.
    expect(recorder.calls, isNot(contains('firebase')));
    expect(recorder.calls, containsAll(<String>['push', 'draftSync', 'deepLinks']));
    expect(failures.any((message) => message.contains('deferred.firebase')), isTrue);
  });

  test('a failure while initialising monitoring is contained', () async {
    final bootstrap = build(failOn: 'monitoring');

    await bootstrap.runAfterFirstFrame();

    // The analytics flush still runs, so events raised before the failure are
    // not stranded in the queue.
    expect(recorder.calls, ['analytics']);
  });

  test('the trace records every phase in order', () async {
    final bootstrap = build();

    await bootstrap.runCriticalPath();
    await bootstrap.runDeferred();
    await bootstrap.runAfterFirstFrame();

    expect(bootstrap.trace.map((entry) => entry.phase), [
      'environment',
      'apiClient',
      'deferred.firebase',
      'deferred.pushNotifications',
      'deferred.draftSync',
      'deferred.deepLinks',
      'monitoring',
      'analytics',
    ]);
  });

  test('every traced phase has a non-negative offset from start-up', () async {
    final bootstrap = build();

    await bootstrap.runCriticalPath();
    await bootstrap.runDeferred();
    await bootstrap.runAfterFirstFrame();

    for (final entry in bootstrap.trace) {
      expect(entry.at >= Duration.zero, isTrue, reason: entry.phase);
    }
  });

  test('logged phases report their offset from start-up', () async {
    final logs = <String>[];
    final bootstrap = AppBootstrap(
      loadEnv: () async {},
      initializeApiClient: () {},
      initializeFirebase: () async {},
      initializePushNotifications: () async {},
      startDraftSync: () async {},
      registerDeepLinks: () async {},
      initializeMonitoring: () async {},
      flushAnalytics: () async {},
      log: logs.add,
    );

    await bootstrap.runCriticalPath();

    expect(logs, hasLength(2));
    expect(logs.first, matches(RegExp(r'^\[startup\] environment done at \d+ms$')));
  });
}
