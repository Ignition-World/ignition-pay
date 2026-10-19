# Motion performance on low-end devices (issue #709)

Entry-level Android phones (2–3GB RAM, low-clocked SoCs, 60Hz panels) dropped
below 30fps during page transitions and while skeleton shimmers were on
screen. This document explains what the app now does about it, how the device
tier is detected, and how to reproduce the before/after numbers on a physical
device.

## What changes per tier

| Behaviour | Low | Medium | High | OS "remove animations" |
| --- | --- | --- | --- | --- |
| Page transitions | cross-fade only | platform default | platform default | none (instant) |
| `Hero` flights | disabled | enabled | enabled | disabled |
| Shimmer sweep | capped at 30fps | full frame rate | full frame rate | off (static placeholder) |
| Settings/state | unchanged | unchanged | unchanged | unchanged |

Medium and high tiers resolve to Flutter's stock builders for the current
platform (predictive back on Android, Cupertino on iOS/macOS, zoom elsewhere),
so a capable device is pixel-identical to a stock Material app.

## Tier detection

`PerformanceTierService` (`lib/core/performance/performance_tier_service.dart`)
runs two dependency-free heuristics:

1. **Display refresh rate** — a panel capped at or below 45Hz cannot render
   60fps, so it is treated as low-end regardless of the SoC.
2. **Total memory** — read from `/proc/meminfo` on Android/Linux. Devices
   below 3GB (Samsung A0x class, Redmi 9A class) are treated as low-end.

Anything inconclusive resolves to **medium**, which keeps the default motion.
The result is stored by `PerformanceTierCache` together with the OS version:

```text
perf.tier.v1            -> 'low' | 'medium' | 'high'
perf.tier.v1.os_version -> OS version at detection time
```

Detection therefore runs **once**, and again only when the OS version string
changes (a major OS update) or when the stored value is not a known tier.

The OS accessibility request (`MediaQuery.disableAnimations`, wired from
Android "Remove animations" / iOS "Reduce Motion") always wins and is read on
every build, so toggling it takes effect without an app restart.

## Measuring before/after

Use a **profile** build — debug builds are not representative.

```bash
cd ignition-mobile
flutter run --profile --device-id <device>
```

On the device, install the performance overlay and record a transition
sequence:

1. Open DevTools → Performance, or enable the on-device
   `performanceOverlay` / `flutter run` key `P` for the frame-time graph.
2. Record a run that (a) navigates Home → Send → Receive → Settings, and
   (b) pulls to refresh Home so the skeleton shimmer is on screen for >2s.
3. Read the `FrameTimingSummary` (average / 90th / 99th build+raster time)
   after the run; the UI-thread and raster-thread frame times must both stay
   below 16.7ms for 60fps, or below 33.3ms for 30fps.

Reference device for this issue: **Samsung Galaxy A10** (Exynos 7884, 2GB RAM,
Android 11). Fill in the table after the first on-device run — the columns
below are what the maintainers asked to see documented:

| Scenario | Before (default motion) | After (adaptive motion) |
| --- | --- | --- |
| Home → Send transition | _to measure on device_ | _to measure on device_ |
| Send → Receive transition | _to measure on device_ | _to measure on device_ |
| Home skeleton shimmer (2s) | _to measure on device_ | _to measure on device_ |

### Why the numbers move

* Transitions: the platform zoom/slide animates a translation, a scale and
  (on Android) route snapshots. The replacement is a single opacity
  animation, which removes the transform and snapshot work entirely.
* Heroes: a hero flight animates two full subtrees at once; on a 2GB device
  that alone can drop a frame. It is disabled on low tier.
* Shimmer: the `shimmer` package repaints its gradient on every vsync. The
  capped sweep (`CappedFpsShimmer` + `FrameRateGate`) repaints at most 30
  times per second, halving the paint work during skeleton states while
  looking the same to the eye.

## Tests

`test/core/performance/performance_tier_service_test.dart` covers the
heuristics and the cache (including re-evaluation after an OS update);
`test/core/performance/performance_tier_controller_test.dart` covers the
policy resolution (tier, accessibility, overrides); and
`test/core/design_system/motion_test.dart` verifies the transition applied per
tier, the 30fps shimmer cap and the reduce-motion paths.
