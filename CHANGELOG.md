# Changelog

All notable changes to Ignition Pay and Stellar Address Kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/Ignition-World/ignition-pay/releases/tag/v0.1.0