# Contributing to Stellar Address Kit

First off, thank you for considering contributing to the Stellar Address Kit! It's people like you that make the Stellar ecosystem a better place for developers.

### How Can I Contribute?

#### Adding Spec Vectors

The most impactful way to contribute is by adding new test vectors to `spec/vectors.json`. If you find an edge case or a tricky address format, follow these steps:

1. Add the case to `spec/vectors.json`.
2. Run `node spec/validate.js` to ensure it meets the schema.
3. Update the TypeScript, Go, and Dart implementations to pass the new vector.

#### Reporting Bugs

- Check the [Issues](https://github.com/Boxkit-Labs/stellar-address-kit/issues) to see if the bug has already been reported.
- If not, open a new issue with a clear title and description, including steps to reproduce the bug.

#### Triaging and Labeling Issues

When triaging issues, please ensure they are properly labeled to help maintainers organize work. Examples:

- **bug**: Something isn't working. (e.g., `bug`, `priority:high`)
- **enhancement**: New feature or request. (e.g., `enhancement`, `needs-discussion`)
- **documentation**: Improvements or additions to documentation. (e.g., `documentation`)
- **good first issue**: Good for newcomers. (e.g., `good first issue`, `help wanted`)

#### Suggesting Enhancements

- Open an issue to discuss your idea.
- Clearly explain why this enhancement would be useful to others.

#### Pull Requests

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes (`pnpm test`, `go test ./...`, `dart test`).
5. Use `pnpm changeset` to document your changes.

### Development Setup

```bash
# Install root/workspace dependencies
pnpm install

# Install app-specific dependencies when working in those folders
cd ignition-api && npm install
cd ../ignition-pay-frontend && pnpm install
cd ..

# Run the spec validator
node spec/validate.js

# Run tests across all packages
pnpm test
```

The root install configures Git to use the repository-managed hooks in `.githooks/`. From then on, every commit automatically runs the staged-file formatter/linter pipeline before Git creates the commit.

If you need to re-apply the hook setup manually:

```bash
node scripts/setup-git-hooks.mjs
```

### Style Guide

- **TypeScript**: Follow the existing Prettier/ESLint config.
- **Go**: `gofmt` runs automatically for staged `packages/core-go` changes before commit.
- **Dart**: `dart format` runs automatically for staged Dart changes before commit.

### Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## Git Workflow and Branching Strategy

### Branch Naming Conventions
- `feature/<issue-number>-<description>` — New features (e.g., `feature/45-android-setup`)
- `bugfix/<issue-number>-<description>` — Bug fixes
- `hotfix/<issue-number>-<description>` — Urgent production fixes
- `docs/<description>` — Documentation only changes
- `chore/<description>` — Maintenance, CI/CD, tooling

### Commit Message Conventions
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — A new feature
- `fix:` — A bug fix
- `docs:` — Documentation only
- `chore:` — Maintenance, CI/CD
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests

Format: `<type>: <description>`

### Pull Request Process
1. Create a feature branch from `main`
2. Implement your changes with clear commit messages
3. Update documentation and tests as needed
4. Create a pull request against `main`
5. Ensure CI checks pass before requesting review
6. Squash merge on approval

### Code Review Guidelines
- All code requires at least one approval
- Address all review comments before merging
- Keep PRs focused on a single concern
