# Unit Testing Conventions

## Test framework

The mobile app uses Flutter's built-in `flutter_test` package together with `test` for pure Dart tests.

## Recommended structure

- Place widget tests under `test/`.
- Keep helpers in `test/helpers/`.
- Use descriptive test names that explain the behavior under test.
- Prefer small, focused tests over broad integration-style cases.

## Helper utilities

Use the helpers in `test/helpers/` when you need a ready-made app shell:

- `testApp(...)` for a simple material app wrapper.
- `pumpApp(...)` for pumping a widget and settling animations.
- `pumpAppWithTestRouter(...)` when the widget needs routing context.

## Example

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/core/design_system/app_theme.dart';
import 'package:ignition_mobile/main.dart';
import '../helpers/test_helpers.dart';

void main() {
  testWidgets('renders the app shell', (tester) async {
    await tester.pumpApp(const SizedBox());
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
```

## Conventions

- Use `testWidgets` for UI behavior and `test` for pure logic.
- Prefer `pumpApp(...)` over hand-rolling `MaterialApp` in each test.
- Keep assertions narrow and behavior-focused.
- Mock external dependencies at the boundary, not inside the widget under test.
