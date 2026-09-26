# Ignition Pay Mobile

The Flutter mobile application for the Ignition Pay Stellar wallet ecosystem.

> Note: This package currently expects native platform folders for Android and iOS to be present before mobile-specific tooling is added.

## Stack

- **Framework**: Flutter 3.22+
- **Language**: Dart 3.4+
- **State Management**: Provider / Riverpod
- **Storage**: Drift (SQLite), FlutterSecureStorage

## Getting Started

```bash
flutter pub get
flutter run
```

## Build Targets

| Platform | Command             |
| -------- | ------------------- |
| Android  | `flutter build apk` |
| iOS      | `flutter build ios` |
| Web      | `flutter build web` |

## Features

- Native iOS and Android wallet experience
- Biometric authentication (Face ID / fingerprint)
- QR code scanning for Stellar addresses
- Deep link support for payment requests
- Push notifications via FCM
- Offline-resilient transaction drafts

## Architecture

The app follows a feature-first architecture with shared core utilities in `lib/core/` and self-contained feature modules in `lib/features/`.

## Store Publishing Setup

For App Store Connect and Google Play Console preparation, see [docs/STORE_SETUP.md](docs/STORE_SETUP.md). The repository also includes a metadata starter file at [docs/store-metadata-template.json](docs/store-metadata-template.json).

## Testing

For Flutter unit and widget testing conventions, see [docs/TESTING.md](docs/TESTING.md). A minimal smoke test is available at [test/widget_smoke_test.dart](test/widget_smoke_test.dart).
