# Changelog

All notable changes to Ignition Pay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI workflows for Dart, Flutter, TypeScript, and Go packages
- Coverage reporting with Codecov integration
- Root-level CHANGELOG.md following Keep a Changelog format
- Root-level VERSIONING.md documenting semantic versioning strategy
- Automated pub.dev publishing workflow for Dart package
- Automated NPM publishing workflow for TypeScript package

### Changed
- Enhanced ci-dart workflow with multi-SDK matrix (3.0, 3.6, stable)
- Separated analysis, testing, web-compat, and coverage into dedicated jobs
- Updated spec versioning documentation with compatibility matrix

## [0.1.0] - 2026-06-21

### Added
- Initial release of Stellar Address Kit
- TypeScript package (`@stellar-address-kit/core-ts`) with full address parsing and routing
- Dart package (`stellar_address_kit`) with cross-platform Stellar address support
- Go package (`core-go`) with address validation and extraction
- SEP-0023 M-address support across all packages
- Routing extraction with memo fallback
- Address validation with detailed warning system
- Warning system with severity levels (info, warning, error)
- Comprehensive test vectors in `spec/vectors.json`
- CI/CD pipelines for all packages (Dart, Go, TypeScript)
- Documentation site with Mintlify
- Example implementations (Flutter, React, Go, Python, Dart)
- Changesets for automated versioning

### Security
- Non-custodial key management architecture
- Address checksum validation
- Input sanitization and validation

[Unreleased]: https://github.com/Ignition-World/ignition-pay/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Ignition-World/ignition-pay/releases/tag/v0.1.0
