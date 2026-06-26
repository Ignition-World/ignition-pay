# Changelog

All notable changes to the Stellar Address Kit Dart package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2025-06-26

### Added

- `CHANGELOG.md` with semantic versioning and migration guidance
- Comprehensive API documentation in `README.md` covering all public classes and functions
- Example implementations for each major feature:
  - `example/address_detection.dart` — address detection and validation
  - `example/muxed_operations.dart` — Muxed address encoding/decoding
  - `example/routing_extraction.dart` — deposit routing extraction
  - `example/parse_and_parse_result.dart` — parse() with warnings and errors
  - `example/main.dart` — comprehensive feature overview

### Changed

- Enhanced CI workflow (`ci-dart.yml`):
  - Multi-version Dart SDK testing matrix (3.0, 3.6, stable)
  - Flutter compatibility testing (stable, beta channels)
  - Coverage collection and Codecov upload
  - Separate analyze, test, web-test, spec-check, and Flutter jobs
- Updated README with detailed API reference, architecture docs, and design decisions

### Migration from 1.0.0

Version 1.0.0 was the initial release. Version 1.0.1 adds documentation, examples, and CI enhancements.

**No breaking changes** — all existing APIs remain stable and backward-compatible.

To migrate from 1.0.0:
1. Update your `pubspec.yaml` to `stellar_address_kit: ^1.0.1`
2. Run `dart pub get`
3. Optional: review the new examples in `example/` for updated usage patterns
