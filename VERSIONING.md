# Versioning Strategy

This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (SemVer 2.0.0) for all packages.

## Version Format

All packages follow the `MAJOR.MINOR.PATCH` format:

- **MAJOR** - Breaking changes that require migration steps
- **MINOR** - New features that are backward-compatible
- **PATCH** - Bug fixes and minor improvements

## Package Versioning

| Package | Current Version | Stability |
|---------|----------------|-----------|
| @stellar-address-kit/core-ts | 0.1.0 | Alpha |
| stellar_address_kit (Dart) | 0.1.0 | Alpha |
| core-go (Go) | 0.1.0 | Alpha |

### Pre-release
All packages are currently in pre-release (0.x.y). During this phase:
- Minor versions may include breaking changes
- API stability is not guaranteed
- Frequent releases are expected

## Release Process

1. **Change Collection**: Developers create changeset files using `pnpm changeset`
2. **Version Bump**: When ready, run `pnpm changeset version` to update versions and changelog
3. **Pull Request**: Open a PR with the version changes
4. **Tag & Release**: Once merged, create a git tag and GitHub release
5. **Publish**: Automated CI publishes to NPM/pub.dev/Go proxy

## Breaking Changes

Breaking changes require:
1. A MAJOR version bump
2. Migration guide in the changelog
3. Deprecation warnings for one minor version before removal

## Migration Guides

Migration guides for breaking changes are maintained in:
- `docs/migration/memo-to-muxed.md` - Memo to M-address migration
- `docs/migration/compatibility.md` - Cross-version compatibility notes