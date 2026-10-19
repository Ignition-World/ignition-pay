# Typography / font loading

Ignition Mobile uses **Inter** via [`google_fonts`](https://pub.dev/packages/google_fonts).

| Concern | Behavior |
| --- | --- |
| Consistency | `AppTheme` sets Inter on `ThemeData.textTheme` / `fontFamily` (not per-widget) |
| Preload | `AppTheme.preloadFonts()` runs after the first frame from `IgnitionPayApp` |
| First frame | Never blocked on font network I/O |
| Fallback | Explicit `AppTheme.fontFamilyFallback` (Roboto, SF Pro, Segoe UI, …) — not silent |
| Accessibility | Ambient `MediaQuery` text scaler is respected |

Visual parity: run the (skipped) golden in `app_theme_font_test.dart` on Android and iOS with `--update-goldens`, then compare `goldens/app_theme_fonts_side_by_side.png`.
