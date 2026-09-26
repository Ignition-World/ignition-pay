# Release Build Optimization

## Flutter Build Flags

```bash
# Optimized release build
flutter build apk --release \
  --tree-shake-icons \
  --split-debug-info=build/debug-info \
  --obfuscate

# App Bundle (preferred for Play Store)
flutter build appbundle --release \
  --tree-shake-icons \
  --obfuscate \
  --split-debug-info=build/debug-info
```

## Tree Shaking

Flutter removes unused code and icons automatically in release mode.
Ensure `--tree-shake-icons` is passed to remove unused icon glyphs.

## Obfuscation

`--obfuscate` combined with `--split-debug-info` enables Dart code obfuscation.
Store the `debug-info` directory to de-obfuscate crash stack traces.

## Asset Optimization

- Use `flutter_svg` for vector assets instead of raster PNGs where possible.
- Compress image assets before committing.
