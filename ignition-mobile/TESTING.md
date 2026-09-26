# ignition-mobile — Testing Conventions

This document captures how unit, widget, integration, and end-to-end tests are organized in `ignition-mobile/`. The project ships with three complementary layers.

## 1. Unit tests — `test/`

- Files named `*_test.dart` under `test/`.
- Pure Dart, run via `flutter test test/`.
- Use [`mocktail`](https://pub.dev/packages/mocktail) for most cases; mocked HTTP transport is preferred over real Dio calls.
- AAA structure (Arrange / Act / Assert). One assertion focus per `test()`.
- Naming: `group('ClassName', () { test('does Y when Z', () { ... }) })`.

## 2. Widget tests — `test/widgets/`

- Pump widgets in `MaterialApp` shells or themed harness widgets, never the real app.
- Use `pumpAndSettle()` only when animations are involved; prefer `pump()` with explicit duration in tests.
- Avoid `print`/`debugPrint` in widget tests; use `find.byKey` / `find.text` for assertions.

## 3. Integration / end-to-end — `integration_test/`

- Single entry point: `integration_test/app_test.dart`.
- Runs on a connected device or emulator: `flutter test integration_test/app_test.dart`.
- Scenarios selected via `--dart-define=SCENARIO=<app_launch|deep_link|auth_flow|android|ios|all>`. `all` is the default.
- See `README_INTEGRATION_TESTING.md` for caveats (slow, real network, device-only).

## Mocks and fakes

- Use `mocktail` for everything except generated code (`freezed` / `json_serializable`); for those, prefer real fixtures shipped in `test/fixtures/`.
- Avoid `mockito`-style `when(...).thenReturn(...)`: prefer explicit stub functions and lambda returns.

## Static analysis

- Run `dart analyze` against `analysis_options.yaml`. CI runs it on every PR.
- Any new file must obey the lint set in `analysis_options.yaml`; otherwise CI fails.

## Running everything locally

```bash
# unit + widget tests
flutter test

# end-to-end (requires connected device)
flutter test integration_test/app_test.dart --dart-define=SCENARIO=all

# lint
dart analyze
```

## Adding a new test

1. Pick the right layer (`unit`, `widget`, or `integration`).
2. Mirror the directory layout (`test/`, `test/widgets/`, `integration_test/`).
3. Filename must match the file under test (`foo.dart` → `foo_test.dart`).
4. Stub time/network/storage explicitly; never rely on filesystem flakes.
5. Wire into the scenario set in `integration_test/app_test.dart` if it's an E2E test; otherwise document the manual run command in this README.
