# Testing Guide

## Frontend Tests

The frontend uses Jest with React Testing Library.

```bash
cd ignition-pay-frontend
npm test          # Run tests
npm run test:watch  # Watch mode
```

### Writing Tests

- Place test files next to the component they test as `*.test.tsx`
- Use `@testing-library/react` for component tests
- Test user interactions, not implementation details

## API Tests

The API uses Jest with Supertest for e2e testing.

```bash
cd ignition-api
npm test              # Unit tests
npm run test:e2e      # End-to-end tests
```

### Test Structure

- Unit tests: `*.spec.ts` files alongside source files
- E2E tests: `test/` directory at project root

## Mobile Tests

Flutter tests use the `flutter_test` package.

```bash
cd ignition-mobile
flutter test
```

## Test Coverage Goals

- **Critical paths**: 100% (wallet creation, sending, receiving)
- **Utilities**: 90%+
- **Components**: 80%+
- **API modules**: 85%+

## Running All Tests

```bash
# From repo root
cd ignition-pay-frontend && npm test
cd ignition-api && npm test
cd ignition-mobile && flutter test
```
