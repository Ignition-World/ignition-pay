import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_color_tokens.dart';
import 'app_colors.dart';

/// Cross-platform typography for Ignition Mobile.
///
/// ## Font strategy
/// - **Primary family:** Inter, loaded via `google_fonts`.
/// - **Preload:** call [preloadFonts] after the first frame so runtime font
///   fetching never blocks [runApp] / first paint.
/// - **Fallback:** [fontFamilyFallback] is explicit. If Inter cannot be
///   resolved (offline, fetch failure, platform quirk), Flutter paints with
///   these system faces — never a silent empty family.
/// - **Accessibility:** themes do not pin `textScaler` / `textScaleFactor`;
///   Material text respects the ambient [MediaQuery] text scale.
/// - **Application site:** font family is applied on [ThemeData.textTheme]
///   (and [ThemeData.fontFamily]) inside [AppTheme], not on individual
///   widgets.
abstract final class AppTheme {
  /// Canonical UI font family name (Inter).
  static const String fontFamily = 'Inter';

  /// Explicit system fallbacks when Inter is unavailable.
  ///
  /// Order: Android → iOS/macOS → Windows/web → generic.
  static const List<String> fontFamilyFallback = <String>[
    'Roboto',
    '.SF Pro Text',
    'SF Pro Text',
    'Helvetica Neue',
    'Segoe UI',
    'Arial',
    'sans-serif',
  ];

  /// Weights we ship in the design system — preloaded together for parity.
  static const List<FontWeight> _preloadWeights = <FontWeight>[
    FontWeight.w400,
    FontWeight.w500,
    FontWeight.w600,
    FontWeight.w700,
  ];

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  /// Prefetch Inter so Android/iOS/web resolve the same face.
  ///
  /// Safe to call without `await` from a post-frame callback; first paint
  /// continues with [fontFamilyFallback] until the download finishes.
  static Future<void> preloadFonts() {
    return GoogleFonts.pendingFonts([
      for (final weight in _preloadWeights) GoogleFonts.inter(fontWeight: weight),
    ]);
  }

  static TextTheme _interTextTheme(TextTheme base) {
    // google_fonts builds a TextTheme whose styles share the Inter family.
    // Re-apply explicit fallbacks so a failed fetch is documented & visible.
    final inter = GoogleFonts.interTextTheme(base);
    return _withFallback(inter);
  }

  static TextTheme _withFallback(TextTheme theme) {
    TextStyle? attach(TextStyle? style) {
      if (style == null) return null;
      return style.copyWith(
        fontFamily: fontFamily,
        fontFamilyFallback: fontFamilyFallback,
      );
    }

    return TextTheme(
      displayLarge: attach(theme.displayLarge),
      displayMedium: attach(theme.displayMedium),
      displaySmall: attach(theme.displaySmall),
      headlineLarge: attach(theme.headlineLarge),
      headlineMedium: attach(theme.headlineMedium),
      headlineSmall: attach(theme.headlineSmall),
      titleLarge: attach(theme.titleLarge),
      titleMedium: attach(theme.titleMedium),
      titleSmall: attach(theme.titleSmall),
      bodyLarge: attach(theme.bodyLarge),
      bodyMedium: attach(theme.bodyMedium),
      bodySmall: attach(theme.bodySmall),
      labelLarge: attach(theme.labelLarge),
      labelMedium: attach(theme.labelMedium),
      labelSmall: attach(theme.labelSmall),
    );
  }

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final base = ThemeData(
      colorSchemeSeed: AppColors.primary,
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor:
          isDark ? AppColors.surfaceDark : AppColors.surface,
      fontFamily: fontFamily,
    );

    final textTheme = _interTextTheme(base.textTheme);
    final primaryTextTheme = _interTextTheme(base.primaryTextTheme);

    return base.copyWith(
      textTheme: textTheme,
      primaryTextTheme: primaryTextTheme,
      // Keep ThemeData-level family aligned with TextTheme (not per-widget).
      fontFamily: fontFamily,
      extensions: <ThemeExtension<dynamic>>[
        appColorTokensFor(brightness),
      ],
    );
  }
}
