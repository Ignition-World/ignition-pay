# Flutter Web Safe BigInt Demo

This example demonstrates how Dart's standard int type silently corrupts Stellar muxed IDs above 2^53 when compiled to JavaScript for Flutter Web. The stellar_address_kit library prevents this data loss by using BigInt for all 64-bit integer operations, ensuring identical behavior across web and native platforms.

## Features
- Direct demonstration of the JavaScript 53-bit integer limit issue
- Utilizes `stellar_address_kit` to safely handle 64-bit muxed IDs via Dart's BigInt
- Cross-platform consistency between native Dart integers and web execution

## Use Cases
- Verifying the integrity of ID precision when compiling Flutter apps to the web
- Educational resource for understanding BigInt constraints in Dart web development

## Quick Start

flutter run -d chrome
flutter run

## Platform Behavior

Numerical corruption only occurs on Flutter Web due to JavaScript's 53-bit integer limitation. Native platforms (iOS, Android, Desktop) handle full 64-bit integers correctly using Dart's native int representation.

[View on pub.dev](https://pub.dev/packages/stellar_address_kit)
