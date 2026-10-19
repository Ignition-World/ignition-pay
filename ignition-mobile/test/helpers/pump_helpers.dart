import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'test_app.dart';

extension WidgetTesterPumpHelpers on WidgetTester {
  /// Pumps [widget] inside a bare [MaterialApp] and settles all animations.
  ///
  /// Equivalent to `pumpWidget(testApp(widget))` + `pumpAndSettle()`.
  Future<void> pumpApp(Widget widget, {ThemeData? theme}) async {
    await pumpWidget(testApp(widget, theme: theme));
    await pumpAndSettle();
  }

  /// Pumps [widget] inside a [MaterialApp.router] backed by [router] and
  /// settles all animations.
  Future<void> pumpAppWithRouter(GoRouter router) async {
    await pumpWidget(testAppWithRouter(router));
    await pumpAndSettle();
  }

  /// Pumps [widget] with a minimal [GoRouter] that serves it at `/`.
  ///
  /// Handy for widgets that reference the router but don't navigate.
  Future<void> pumpAppWithTestRouter(Widget widget) async {
    final router = testRouter(widget);
    await pumpAppWithRouter(router);
  }

  /// Pumps [widget] and then advances time by [duration] without settling.
  ///
  /// Useful for testing intermediate animation states or debounced callbacks.
  Future<void> pumpAppFor(Widget widget, Duration duration) async {
    await pumpWidget(testApp(widget));
    await pump(duration);
  }

  /// Triggers a frame, waits for [duration], and triggers another frame.
  ///
  /// Simulates a real-time delay (e.g., a network call that takes [duration]).
  Future<void> pumpAndWait(Duration duration) async {
    await pump();
    await pump(duration);
    await pumpAndSettle();
  }

  /// Finds a widget of type [T] and taps it, then settles.
  Future<void> tapAndSettle<T extends Widget>() async {
    await tap(find.byType(T));
    await pumpAndSettle();
  }

  /// Finds a widget by [key], taps it, then settles.
  Future<void> tapKeyAndSettle(Key key) async {
    await tap(find.byKey(key));
    await pumpAndSettle();
  }

  /// Enters [text] into the first [TextField] found and settles.
  Future<void> enterTextAndSettle(Finder finder, String text) async {
    await enterText(finder, text);
    await pumpAndSettle();
  }

  /// Scrolls until [finder] is visible, then settles.
  Future<void> scrollToAndSettle(
    Finder finder, {
    Finder? scrollable,
    double delta = 300.0,
  }) async {
    await scrollUntilVisible(
      finder,
      delta,
      scrollable: scrollable ?? find.byType(Scrollable).first,
    );
    await pumpAndSettle();
  }
}
