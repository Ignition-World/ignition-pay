import 'package:flutter/material.dart';

/// Semantic colours that are not covered by [ColorScheme].
///
/// Registered on [ThemeData.extensions] by `AppTheme`, so every component
/// reads them through the ambient theme instead of hardcoding a light-mode
/// literal. `Theme.of(context).extension<AppColorTokens>()!` is safe because
/// both `AppTheme.light` and `AppTheme.dark` register it, and the tests
/// build widgets with those themes.
@immutable
class AppColorTokens extends ThemeExtension<AppColorTokens> {
  const AppColorTokens({
    required this.shimmerBase,
    required this.shimmerHighlight,
    required this.placeholderSurface,
    required this.muted,
    required this.success,
    required this.error,
    required this.warning,
  });

  /// Base tone of a loading shimmer.
  final Color shimmerBase;

  /// Moving highlight of a loading shimmer.
  final Color shimmerHighlight;

  /// Surface used for placeholders, e.g. a failed image load.
  final Color placeholderSurface;

  /// De-emphasised text and icons.
  final Color muted;

  final Color success;
  final Color error;
  final Color warning;

  /// Token set for light mode.
  static const light = AppColorTokens(
    shimmerBase: _lightShimmerBase,
    shimmerHighlight: _lightShimmerHighlight,
    placeholderSurface: _lightPlaceholderSurface,
    muted: Color(0xFF616161),
    success: Color(0xFF2E7D32),
    error: Color(0xFFD32F2F),
    warning: Color(0xFFF57C00),
  );

  /// Token set for dark mode.
  static const dark = AppColorTokens(
    shimmerBase: _darkShimmerBase,
    shimmerHighlight: _darkShimmerHighlight,
    placeholderSurface: _darkPlaceholderSurface,
    muted: Color(0xFFB0B0C0),
    success: Color(0xFF66BB6A),
    error: Color(0xFFEF5350),
    warning: Color(0xFFFFA726),
  );

  @override
  AppColorTokens copyWith({
    Color? shimmerBase,
    Color? shimmerHighlight,
    Color? placeholderSurface,
    Color? muted,
    Color? success,
    Color? error,
    Color? warning,
  }) {
    return AppColorTokens(
      shimmerBase: shimmerBase ?? this.shimmerBase,
      shimmerHighlight: shimmerHighlight ?? this.shimmerHighlight,
      placeholderSurface: placeholderSurface ?? this.placeholderSurface,
      muted: muted ?? this.muted,
      success: success ?? this.success,
      error: error ?? this.error,
      warning: warning ?? this.warning,
    );
  }

  @override
  AppColorTokens lerp(ThemeExtension<AppColorTokens>? other, double t) {
    if (other is! AppColorTokens) return this;
    return AppColorTokens(
      shimmerBase: Color.lerp(shimmerBase, other.shimmerBase, t)!,
      shimmerHighlight: Color.lerp(shimmerHighlight, other.shimmerHighlight, t)!,
      placeholderSurface: Color.lerp(placeholderSurface, other.placeholderSurface, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      success: Color.lerp(success, other.success, t)!,
      error: Color.lerp(error, other.error, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
    );
  }
}

/// Convenience accessor for [AppColorTokens].
///
/// Falls back to the light tokens so a widget rendered under a theme that
/// forgot to register the extension still builds instead of throwing.
extension AppColorTokensContext on BuildContext {
  AppColorTokens get appColors =>
      Theme.of(this).extension<AppColorTokens>() ?? AppColorTokens.light;
}

/// The light-mode token set, matching the values the design system shipped
/// with before dark mode was introduced.
const _lightShimmerBase = Color(0xFFE0E0E0);
const _lightShimmerHighlight = Color(0xFFF5F5F5);
const _lightPlaceholderSurface = Color(0xFFFFFFFF);

/// The dark-mode token set, matching the values the design system already
/// used when it branched on brightness.
const _darkShimmerBase = Color(0xFF2C2C3E);
const _darkShimmerHighlight = Color(0xFF3D3D55);
const _darkPlaceholderSurface = Color(0xFF1A1A2E);

/// Builds the token set for [brightness].
AppColorTokens appColorTokensFor(Brightness brightness) {
  return brightness == Brightness.dark
      ? AppColorTokens.dark
      : AppColorTokens.light;
}
