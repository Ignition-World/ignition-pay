# App startup performance (#684)

`ignition-mobile` used to do every piece of start-up work **before** the first
frame: `main()` awaited `.env`, Firebase Core, Crashlytics, Sentry, push
notification setup, the offline draft sync service and a deep-link round trip,
and only then called `runApp`. None of that could overlap with rendering, so
every millisecond of it was added to time-to-first-frame.

The start-up sequence is now split in three phases, and `main()` only awaits the
first one.

## The sequence

```
main()
 ├─ runApp(SplashApp())              ← first frame, no plugin/asset/network work
 ├─ await runCriticalPath()          ← ONLY this is awaited
 │    ├─ environment   (.env, parsed in a background isolate)
 │    └─ apiClient     (interceptors, no I/O)
 ├─ runApp(IgnitionPayApp())         ← home screen renders
 ├─ unawaited runDeferred()          ← nothing above waits for this
 │    ├─ deferred.firebase           (LazyFirebase.ensureInitialized)
 │    ├─ deferred.pushNotifications  (requestPermission, FCM listeners)
 │    ├─ deferred.draftSync          (offline send queue, #678)
 │    └─ deferred.deepLinks          (cold-start + warm link handling)
 └─ first post-frame callback → runAfterFirstFrame()
      ├─ monitoring  (Sentry + frame-jank tracking)
      └─ analytics   (flush events queued before TTI)
```

| Work | Before | After |
| --- | --- | --- |
| `.env` | awaited before `runApp` | background isolate, still before the home screen |
| Firebase Core | awaited before `runApp` | lazy, on first Firebase use (`PushNotificationService.init`) |
| Crashlytics handlers | installed with Firebase, pre-`runApp` | installed with `LazyFirebase`, in the deferred phase |
| Sentry | `await`ed before `runApp`, wrapped `runApp` in `appRunner` | post-frame callback, error handlers chained to Crashlytics |
| Analytics | Firebase plugin touched during start-up | queued until `markTimeToInteractive()`, then flushed |
| Push notifications | awaited before `runApp` | deferred |
| Offline draft sync | awaited before `runApp` | deferred |
| Deep links | awaited before `runApp` (before the router had a delegate) | deferred, after `runApp` |

## What moved into a background isolate

`dotenv.load()` is not split naively:

* the asset read stays on the UI isolate — `rootBundle` is a platform channel
  and cannot be used from another isolate;
* the **parse** runs in a background isolate via `compute(parseDotEnv, raw)`,
  because that is the part that grows with the file;
* the parsed map is published into `dotenv` directly, so the UI isolate never
  parses twice.

On web, where isolates are unavailable, the parse runs inline and
`EnvLoadResult.usedBackgroundIsolate` is `false`.

## Measuring it

Every phase logs its offset from `main()`:

```
[startup] .env parsed in 3ms (background isolate: true)
[startup] environment done at 27ms
[startup] apiClient done at 27ms
[startup] deferred.firebase done at 412ms
[startup] deferred.pushNotifications done at 690ms
[startup] deferred.draftSync done at 701ms
[startup] deferred.deepLinks done at 733ms
[startup] monitoring done at 812ms
[startup] analytics done at 815ms
```

To reproduce those numbers on a device:

```bash
# 1. Profile build on a mid-range device (the log lines are debug-only)
flutter run --profile -d <device-id> --dart-define=SENTRY_DSN=<dsn>

# 2. Cold-start the app and read the phase timings
adb logcat -s flutter | grep '\[startup\]'
# or, for iOS
xcrun simctl spawn booted log stream --predicate 'eventMessage contains "[startup]"'

# 3. Time to first frame / fully drawn, independent of the app's own logs
adb shell am start -W -n <application-id>/.MainActivity   # "TotalTime"
# or, for a release/profile build with the Flutter driver:
flutter run --profile -d <device-id> --trace-startup
```

In DevTools, the Performance view shows the same split: with
`--trace-startup`, everything up to the first frame is now only
`.env` + `apiClient`, and the splash is visible while the deferred phases run.

## Status of the "before/after" numbers

**Not measured on a device in this change.** The PR author had no Android/iOS
device available, so the table above records what moved *out of* the
pre-first-frame path (which is verifiable by reading `main()`), not millisecond
deltas on a Snapdragon 665-class handset. The procedure above produces those
numbers in a few minutes; the claim "home renders within 2 s on mid-range
Android" is therefore **unverified** and should be re-measured before being
treated as an acceptance criterion.

What *is* verified by automated tests:

* the splash paints before any bootstrap hook runs, and the home app replaces
  it only after the critical path (`splash_app_test.dart`,
  `app_bootstrap_test.dart`);
* the critical path performs no plugin, Firebase or network work
  (`app_bootstrap_test.dart`: the critical path is exactly `environment` +
  `apiClient`);
* a failure in any phase is contained and logged, so a slow or broken Firebase
  cannot stop the home screen (`app_bootstrap_test.dart`);
* analytics events raised before the app is interactive are queued and flushed
  in order afterwards (`analytics_service_test.dart`);
* `.env` is parsed off the UI isolate and published into `dotenv`
  (`env_loader_test.dart`).

## Non-goals

* No dependency was added or removed, and no plugin was swapped for a lighter
  one. This change is about *ordering*.
* Pre-warming `HomeService`/`ApiClient` requests is deliberately **not** done
  here: the home page fetches on demand, and a speculative request would cost
  battery and could race with the real one.
