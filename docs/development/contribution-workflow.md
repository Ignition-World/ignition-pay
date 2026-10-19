# Contribution Workflow

## Getting Started

1. Fork the repository
2. Clone your fork
3. Add the upstream remote: `git remote add upstream https://github.com/Ignition-World/ignition-pay.git`
4. Create a feature branch from `main`

## Pull Request Process

1. **Scope**: Keep PRs focused on a single feature or fix
2. **Tests**: All tests must pass before requesting review
3. **Lint**: Run linters and fix any issues
4. **Documentation**: Update relevant docs for any changes
5. **Changelog**: Add a changeset entry

## PR Checklist

- [ ] Code follows project coding standards
- [ ] Tests added/updated for new behavior
- [ ] All existing tests pass
- [ ] Lint checks pass
- [ ] Documentation updated (if applicable)
- [ ] Changeset added (for packages with versioned releases)

## Acceptance Criteria Guidelines

Every feature, bug fix, or enhancement should be framed with clear acceptance criteria before implementation begins. This helps contributors and reviewers agree on what "done" means and keeps scope manageable.

### Definition of Done

A change is considered done when all of the following are true:

- The issue or request is clearly understood, and the intended behavior is documented.
- Acceptance criteria are written in measurable terms and reflect user-facing outcomes.
- The implementation satisfies the criteria and does not introduce obvious regressions.
- Relevant tests, docs, and release notes are updated when needed.
- The change has been reviewed and validated by the appropriate maintainers.

### Testing Requirements by Issue Type

- Feature work: define expected user flows, add or update unit/integration tests, and include end-to-end coverage when the change affects a core user journey.
- Bug fixes: include a regression test or repro scenario that demonstrates the issue is resolved.
- UI or UX changes: verify behavior across the affected screen or component and capture any manual validation steps.
- Documentation-only changes: confirm the content is accurate and link correctly, but no functional test is required.
- Breaking or cross-platform changes: include additional validation for impacted services, clients, or environments.

### Code Review Checklist Template

Use the checklist below for PRs and issue follow-up work:

- [ ] The issue scope and acceptance criteria are clear.
- [ ] The implementation meets the documented definition of done.
- [ ] Tests were added or updated where appropriate.
- [ ] Edge cases and regressions were considered.
- [ ] Documentation and release notes were updated when needed.
- [ ] Security, performance, and compatibility implications were reviewed.
- [ ] The PR description includes testing evidence and relevant links to the issue.

## Review Process

1. At least one maintainer review required
2. Address review feedback with additional commits
3. Squash commits before merge (or use squash merge)

## Code Review Guidelines

- Be respectful and constructive
- Focus on the code, not the person
- Explain the "why" behind suggestions
- Approve when the code is correct, not when it matches your personal style
